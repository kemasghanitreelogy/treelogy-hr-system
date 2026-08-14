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

export function Input({
  className,
  onWheel,
  onKeyDown,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const angka = props.type === "number";
  return (
    <input
      className={cn(base, className)}
      onWheel={(e) => {
        // Roda mouse di atas <input type="number"> MENGUBAH ISINYA di semua
        // browser desktop. Nominal yang sudah benar bisa berkurang beberapa
        // rupiah hanya karena pengguna menggulir formulir — tanpa jejak, tanpa
        // sadar. Melepas fokus mengembalikan gulirannya untuk menggulir
        // halaman, bukan mengedit angka.
        if (angka) e.currentTarget.blur();
        onWheel?.(e);
      }}
      onKeyDown={(e) => {
        // Alasan sama untuk panah atas/bawah: pada isian nominal, menekannya
        // mengubah angka, bukan memindahkan kursor seperti dugaan pengguna.
        if (angka && (e.key === "ArrowUp" || e.key === "ArrowDown")) e.preventDefault();
        onKeyDown?.(e);
      }}
      {...props}
    />
  );
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
