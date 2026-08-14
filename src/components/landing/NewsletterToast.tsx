"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function NewsletterToast() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const status = searchParams.get("newsletter");
    if (status === "confirmed") {
      toast.success("Email confirmed! You're now subscribed to the newsletter.");
    } else if (status === "already_confirmed") {
      toast.info("Your email is already confirmed.");
    } else if (status === "invalid") {
      toast.error("Invalid or expired confirmation link.");
    } else if (status === "unsubscribed") {
      toast.success("You have been unsubscribed from the newsletter.");
    }
  }, [searchParams]);

  return null;
}
