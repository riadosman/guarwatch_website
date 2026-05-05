import { Camera, Cloud, Monitor } from "lucide-react";

const STEPS = [
  {
    n: "01",
    icon: Camera,
    title: "Jetson görür",
    body:
      "Hikvision IP kamera akışı DeepStream pipeline'ına girer. YOLO ile kişi tespit, NvDCF ile takip ID'si verilir. PERCLOS + EAR + pitch hesaplanır.",
  },
  {
    n: "02",
    icon: Cloud,
    title: "İhlal sunucuya gönderilir",
    body:
      "GOZ_KAPALI / HAREKETSIZ / UYUYOR durumuna geçildiği an, başlangıç anının 1080p fotosu Bearer-token'lı multipart isteğiyle backend'e gönderilir.",
  },
  {
    n: "03",
    icon: Monitor,
    title: "Operatör görür",
    body:
      "Backend yeni event'i veritabanına yazar, fotoyu diske kaydeder, açık tarayıcılara WebSocket üzerinden push eder. Toast + kart + tıklanabilir kanıt.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-b border-white/5 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Üç adımda canlı izleme.
          </h2>
          <p className="mt-4 text-zinc-400">
            Mimari sade tutuldu: kenar AI, idempotent kuyruk, tek WebSocket
            kanalı. Hiçbir adımda buluta veya 3. parti SaaS'a bağımlılık yok.
          </p>
        </div>
        <ol className="mt-16 grid gap-6 lg:grid-cols-3">
          {STEPS.map(({ n, icon: Icon, title, body }) => (
            <li
              key={n}
              className="relative overflow-hidden rounded-xl border border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-6"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-500">{n}</span>
                <span className="grid h-9 w-9 place-items-center rounded-md bg-white/5 ring-1 ring-white/10">
                  <Icon className="h-4 w-4 text-zinc-300" />
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
