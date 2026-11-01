import { X } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export function Modal(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} class="modal" onClose={props.onClose}>
      <header class="modal-head">
        <h2>{props.title}</h2>
        <button class="icon" aria-label="關閉" onClick={() => ref.current?.close()}>
          <X size={24} aria-hidden="true" />
        </button>
      </header>
      {props.children}
    </dialog>
  );
}
