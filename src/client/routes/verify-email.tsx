import { verifyCode } from "@/client/api/auth";
import { imageUrls } from "@assets/imageUrls";
import type { FormData } from "@components/AuthForm";
import AuthForm from "@components/AuthForm";
import AuthLayout from "@components/AuthLayout";
import { Page } from "@components/Page";
import { SuccessModal } from "@components/SuccessModal";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "../hooks/AuthContext";
import { seo } from "../utils/seo";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: (search.email as string) || "",
  }),
  meta: () => [
    ...seo({
      title: "Verify Email | UF SASE",
      description: "Email verification for UF SASE",
      image: imageUrls["SASELogo.png"],
    }),
  ],
  component: () => {
    const { email } = useSearch({ from: "/verify-email" });
    const { checkSession } = useAuth();
    const navigate = useNavigate();
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const mutation = useMutation({
      mutationFn: async (data: { code: string }) => {
        const response = await verifyCode({ email, code: data.code });
        return response;
      },
      onSuccess: async () => {
        setShowSuccessModal(true);

        await checkSession();

        setTimeout(() => {
          navigate({ to: "/" });
        }, 1500);
      },
      onError: (error) => {
        console.error("Verification error:", error);
        setErrorMessage(error.message);
      },
    });

    const handleVerification = (data: FormData) => {
      mutation.mutate({ code: data.code });
    };

    const handleModalClose = () => {
      setShowSuccessModal(false);
      navigate({ to: "/" });
    };

    return (
      <Page>
        <AuthLayout isSignUp={false}>
          <AuthForm
            title="Verify Email"
            buttonLabel="Verify"
            linkText="Resend code"
            linkRoute="/signup"
            isVerification={true}
            onSubmit={handleVerification}
            errorMessage={errorMessage || undefined}
          />

          <SuccessModal isOpen={showSuccessModal} onClose={handleModalClose} message="You have successfully created your account!" />
        </AuthLayout>
      </Page>
    );
  },
});
