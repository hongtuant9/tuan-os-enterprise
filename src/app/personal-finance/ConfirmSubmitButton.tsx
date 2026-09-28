"use client";

export function ConfirmSubmitButton(props: { label: string; message: string; className?: string }) {
  return <button
    type="submit"
    className={props.className}
    onClick={(event) => {
      const form = event.currentTarget.form;
      const reason = form ? String(new FormData(form).get("reason") ?? "").trim() : "";
      const message = props.message + (reason ? "\n\nLý do: " + reason : "\n\nLý do: chưa nhập");
      if (!window.confirm(message)) event.preventDefault();
    }}
  >{props.label}</button>;
}
