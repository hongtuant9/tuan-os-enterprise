"use client";

export function ConfirmSubmitButton(props: { label: string; message: string; className?: string }) {
  return <button
    type="submit"
    className={props.className}
    onClick={(event) => {
      if (!window.confirm(props.message)) event.preventDefault();
    }}
  >{props.label}</button>;
}
