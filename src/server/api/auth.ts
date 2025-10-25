import { db } from "@/server/db/db";
import { VerificationTemplate } from "@/server/email/verification-template";
import { createErrorResponse, createSuccessResponse } from "@/shared/utils";
import { pendingVerifications, professionalInfo, sessions, userRoleRelationship, users } from "@db/tables";
import { SERVER_ENV } from "@server/env";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { generateIdFromEntropySize } from "lucia";
import { Resend } from "resend";

const { compare, hash } = bcrypt;

const resend = new Resend(SERVER_ENV.RESEND_API_KEY);
const authRoutes = new Hono();

authRoutes.post("/auth/signup", async (c) => {
  const { email, password, username } = await c.req.json();

  const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*!@#$%^&*()\-_=+\\|[{}\];:'",<>./?])[A-Za-z\d!@#$%^&*()\-_=+\\|[{}\];:'",<>./?]{8,}$/;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  //validate username
  if (!username || typeof username !== "string") {
    return createErrorResponse(c, "INVALID_USERNAME", "Invalid username!", 400);
  }
  //validate password
  if (!password || typeof password !== "string" || !passwordRegex.test(password)) {
    return createErrorResponse(c, "INVALID_PASSWORD", "Invalid password from regex", 400);
  }
  //validate email
  if (!email || typeof email !== "string" || !emailRegex.test(email)) {
    console.log(email);
    return createErrorResponse(c, "INVALID_EMAIL", "Invalid email!", 400);
  }

  try {
    // Check if user already exists
    const [existingEmail, existingUsername] = await Promise.all([
      db.select().from(users).where(eq(users.email, email)).get(),
      db.select().from(users).where(eq(users.username, username)).get(),
    ]);

    if (existingEmail) {
      return createErrorResponse(c, "EMAIL_TAKEN", "Email already registered", 400);
    }

    if (existingUsername) {
      return createErrorResponse(c, "USERNAME_TAKEN", "Username already taken", 400);
    }

    // Generate and store verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await hash(verificationCode, 10);
    const hashedPassword = await hash(password, 10);

    // Store pending verification
    await db
      .insert(pendingVerifications)
      .values({
        email,
        code: hashedCode,
        userData: JSON.stringify({ username, password: hashedPassword, email }),
        expiresAt: Date.now() + 10 * 60 * 1000,
      })
      .onConflictDoUpdate({
        target: pendingVerifications.email,
        set: {
          code: hashedCode,
          userData: JSON.stringify({ username, password: hashedPassword, email }),
          expiresAt: Date.now() + 10 * 60 * 1000,
          attempts: 0,
        },
      });

    // Send verification email
    await resend.emails.send({
      from: "UF SASE <alerts@email.ufsase.com>",
      to: [email],
      subject: `${verificationCode} is your verification code`,
      react: VerificationTemplate({ code: verificationCode }),
    });

    return createSuccessResponse(c, { message: "Verification code sent" }, "Please check your email");
  } catch (error) {
    console.error(error);
    return createErrorResponse(c, "SIGNUP_ERROR", "Error during signup", 500);
  }
});

authRoutes.post("/auth/resend-code", async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email || typeof email !== "string") {
      return createErrorResponse(c, "INVALID_INPUT", "Invalid email", 400);
    }
    const pending = await db.select().from(pendingVerifications).where(eq(pendingVerifications.email, email)).get();
    if (!pending) {
      return createErrorResponse(c, "NO_PENDING", "No verification pending", 400);
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await hash(verificationCode, 10);

    await db
      .update(pendingVerifications)
      .set({
        code: hashedCode,
        expiresAt: Date.now() + 10 * 60 * 1000,
        attempts: 0,
      })
      .where(eq(pendingVerifications.email, email));

    await resend.emails.send({
      from: "UF SASE <alerts@email.ufsase.com>",
      to: [email],
      subject: `${verificationCode} is your verification code`,
      react: VerificationTemplate({ code: verificationCode }),
    });

    return createSuccessResponse(c, { message: "Verification code resent" }, "Check your email");
  } catch (err) {
    console.error("Resend error:", err);
    return createErrorResponse(c, "RESEND_ERROR", "Failed to resend code", 500);
  }
});

authRoutes.post("/auth/verify-code", async (c) => {
  const { code, email } = await c.req.json();

  if (!code || typeof code !== "string" || !email || typeof email !== "string") {
    return createErrorResponse(c, "INVALID_INPUT", "Invalid verification input", 400);
  }
  const pending = await db.select().from(pendingVerifications).where(eq(pendingVerifications.email, email)).get();

  if (!pending) {
    return createErrorResponse(c, "INVALID_CODE", "No verification pending", 400);
  }

  if (pending.expiresAt < Date.now()) {
    await db.delete(pendingVerifications).where(eq(pendingVerifications.email, email));
    return createErrorResponse(c, "CODE_EXPIRED", "Verification code expired", 400);
  }

  if (pending.attempts >= 3) {
    await db.delete(pendingVerifications).where(eq(pendingVerifications.email, email));
    return createErrorResponse(c, "TOO_MANY_ATTEMPTS", "Too many attempts, please register again", 400);
  }

  // Verify the code
  const isValidCode = await compare(code, pending.code);
  if (!isValidCode) {
    await db
      .update(pendingVerifications)
      .set({ attempts: pending.attempts + 1 })
      .where(eq(pendingVerifications.email, email));
    return createErrorResponse(c, "INVALID_CODE", "Invalid verification code", 400);
  }

  try {
    const userData = JSON.parse(pending.userData) as {
      username: string;
      password: string;
      email: string;
    };

    const userId = generateIdFromEntropySize(16);

    // Create verified user
    await db.insert(users).values({
      id: userId,
      username: userData.username,
      password: userData.password,
      email: userData.email,
    });

    // Set up additional user data
    await db.insert(professionalInfo).values({ userId });
    await db.insert(userRoleRelationship).values({
      userId,
      role: "user",
    });

    // Remove pending verification
    await db.delete(pendingVerifications).where(eq(pendingVerifications.email, email));

    // Create session and log user in automatically
    const sessionId = generateIdFromEntropySize(16);
    await createSession(sessionId, userId);
    c.header("Set-Cookie", `sessionId=${sessionId}; Path=/; HttpOnly; Secure; Max-Age=3600; SameSite=Strict`);

    return createSuccessResponse(c, { userId, sessionId }, "Account created and logged in");
  } catch (error) {
    console.error(error);
    return createErrorResponse(c, "VERIFICATION_ERROR", "Error completing signup", 500);
  }
});

// Login route
authRoutes.post("/auth/login", async (c) => {
  const formData = await c.req.json();
  const username = formData["username"];
  const password = formData["password"];
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  if (!username || typeof username !== "string" || username.trim() === "") {
    console.log("??????");
    return createErrorResponse(c, "INVALID_USERNAME", "Invalid username!", 401);
  }

  if (!password || typeof password !== "string") {
    return createErrorResponse(c, "INVALID_PASSWORD", "Invalid password from login", 401);
  }

  let user;
  if (emailRegex.test(username)) {
    user = await db.select().from(users).where(eq(users.email, username));
  } else {
    user = await db.select().from(users).where(eq(users.username, username));
  }

  if (user.length === 0) {
    console.log(user);
    return createErrorResponse(c, "INVALID_CREDENTIALS", "Invalid username or password!", 401);
  }

  const validPassword = await compare(password, user[0].password);

  if (!validPassword) {
    return createErrorResponse(c, "INVALID_PASSWORD", "Incorrect password!", 401);
  } else {
    const session_id = generateIdFromEntropySize(16);
    createSession(session_id, user[0].id);
    // Set cookie here
    c.header("Set-Cookie", `sessionId=${session_id}; Path=/; HttpOnly; Secure; Max-Age=3600; SameSite=Strict`);
    return createSuccessResponse(c, { sessionId: session_id }, "Successfully logged in");
  }
});

// Logout route
authRoutes.post("/auth/logout", async (c) => {
  const sessionId = c.req.header("Cookie")?.match(/sessionId=([^;]*)/)?.[1];

  if (!sessionId) {
    return createErrorResponse(c, "NO_SESSION", "No active session found", 401);
  }

  try {
    // delete the session id row from the table
    await db.delete(sessions).where(eq(sessions.id, sessionId));

    return createSuccessResponse(c, null, "Successfully logged out");
  } catch (error) {
    console.log(error);
    return createErrorResponse(c, "LOGOUT_ERROR", "Error logging out", 500);
  }
});

// used for validating sessions
authRoutes.get("/auth/session", async (c) => {
  const sessionId = c.req.header("Cookie")?.match(/sessionId=([^;]*)/)?.[1];
  console.log(sessionId);

  if (!sessionId) {
    return createErrorResponse(c, "NO_SESSION", "No active session", 401);
  }

  try {
    const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();

    if (!session) {
      return createErrorResponse(c, "SESSION_NOT_FOUND", "Session not found", 401);
    }

    if (session.expiresAt < Date.now()) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      // maybe renew session?
      return createErrorResponse(c, "SESSION_EXPIRED", "Session expired", 401);
    }

    const user = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, session.userId)).get();

    if (!user) {
      return createErrorResponse(c, "USER_NOT_FOUND", "User not found", 401);
    }

    const roles = await db
      .select({ role: userRoleRelationship.role })
      .from(userRoleRelationship)
      .where(eq(userRoleRelationship.userId, session.userId))
      .all()
      .then((rows) => rows.map((r) => r.role));

    return createSuccessResponse(c, { id: user.id, username: user.username, roles }, "Session valid");
  } catch (error) {
    console.log(error);
    return createErrorResponse(c, "SESSION_CHECK_ERROR", "Error checking session", 500);
  }
});

async function createSession(sessionID: string, userID: string) {
  try {
    await db.insert(sessions).values({
      id: sessionID,
      userId: userID, //Session expires in 1 hour from when it is created
      expiresAt: Date.now() + 3600 * 1000,
    });
  } catch (error) {
    console.log(error);
  }
}

export default authRoutes;
