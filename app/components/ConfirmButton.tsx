import { useState } from "react";
import { Form } from "react-router";

export function ConfirmButton({ intent, label, confirmLabel, message, className = "btn btn-ghost", action }: {
  intent: string;
  /** Route to post to; defaults to the current one. */
  action?: string;
  label: string;
  confirmLabel: string;
  message: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>;
  }
  return (
    <div className="panel flex flex-col gap-3 p-3">
      <p className="font-semibold">{message}</p>
      <div className="flex gap-3">
        <Form method="post" action={action}>
          <button type="submit" name="intent" value={intent} className="btn btn-ink">{confirmLabel}</button>
        </Form>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Keep it</button>
      </div>
    </div>
  );
}
