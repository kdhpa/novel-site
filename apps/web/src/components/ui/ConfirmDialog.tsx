'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import Button from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '삭제',
  cancelText = '취소',
  variant = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const iconClass = variant === 'danger' ? 'text-rose-300 bg-rose-500/15' : 'text-amber-300 bg-amber-500/15';

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onCancel}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/60" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-sm transform overflow-hidden rounded-lg border border-border bg-background-secondary p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-start gap-4">
                  <div className={clsx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full', iconClass)}>
                    {variant === 'danger' ? <Trash2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Dialog.Title as="h3" className="text-lg font-semibold text-white">
                      {title}
                    </Dialog.Title>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{message}</p>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
                    {cancelText}
                  </Button>
                  <Button type="button" variant="danger" onClick={onConfirm} isLoading={isLoading}>
                    {confirmText}
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
