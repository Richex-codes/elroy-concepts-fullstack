import { useState, useCallback } from "react";

// Promise-based drop-in replacement for window.confirm():
//   const ok = await confirm("Delete this permanently?", { danger: true });
//   if (!ok) return;
// Spread `modalProps` onto a <ConfirmModal /> rendered in the same component.
export function useConfirm() {
  const [state, setState] = useState(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setState({ message, resolve, ...options });
    });
  }, []);

  const handleConfirm = () => {
    state?.resolve(true);
    setState(null);
  };
  const handleCancel = () => {
    state?.resolve(false);
    setState(null);
  };

  const modalProps = {
    open: !!state,
    title: state?.title,
    message: state?.message,
    danger: state?.danger,
    confirmLabel: state?.confirmLabel,
    cancelLabel: state?.cancelLabel,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return { confirm, modalProps };
}
