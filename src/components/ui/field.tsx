import { cn } from "@/lib/utils";

const base =
  "h-10 w-full rounded-xl border border-line bg-panel px-3 text-sm text-ink outline-none transition placeholder:text-faint focus:border-forest-300 focus:ring-2 focus:ring-forest-100 disabled:opacity-60";

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
  required,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  /** Tampilkan penanda wajib. Untuk isian yang bukan <input> (mis. pemilih
   *  berkas), ini satu-satunya cara pengguna tahu isian itu harus diisi. */
  required?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {/* Penanda wajib: tanda bintang untuk mata, kata "wajib" untuk pembaca
            layar — warna saja tidak boleh jadi satu-satunya pembeda. */}
        {required && (
          <>
            <span className="ml-0.5 font-semibold text-clay" aria-hidden>
              *
            </span>
            <span className="sr-only"> (wajib diisi)</span>
          </>
        )}
      </label>
      {children}
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(base, "cursor-pointer pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(base, "h-auto min-h-[80px] resize-y py-2.5", className)}
      {...props}
    />
  );
}
