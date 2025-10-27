import React from "react";

interface VerificationTemplateProps {
  code: string;
}

export const VerificationTemplate: React.FC<Readonly<VerificationTemplateProps>> = ({ code }) => (
  <div style={{ fontFamily: "Arial, sans-serif", maxWidth: "600px", margin: "0 auto" }}>
    <h1>Your Verification Code</h1>
    <p>Enter this code to verify your email:</p>
    <div
      style={{
        background: "#f5f5f5",
        padding: "20px",
        textAlign: "center",
        fontSize: "32px",
        letterSpacing: "5px",
      }}
    >
      {code}
    </div>
    <p>This code will expire in 10 minutes.</p>
    <p>If you didn't request this code, please ignore this email.</p>
  </div>
);
