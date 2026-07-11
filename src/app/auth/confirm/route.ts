import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Email-confirmation callback — token_hash + verifyOtp pattern (CM6.5), NOT
// the OAuth `code` exchange. The Supabase email template links here as
// /auth/confirm?token_hash=...&type=email. Works even when the link opens in
// a different browser than the signup (common on mobile): verifyOtp creates
// a fresh session in whichever browser opened it.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      redirect("/account");
    }
  }

  // Expired, reused, or malformed link → clear next step, not a crash.
  redirect("/login?error=confirm");
}
