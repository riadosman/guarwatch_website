import { Camera, Cloud, Monitor } from "lucide-react";

const STEPS = [
  {
    n: "01",
    icon: Camera,
    title: "Kulübedeki Jetson görür",
    body:
      "Güvenlik kulübesine yerleştirilen IP kamera akışı DeepStream pipeline'ına girer. YOLO ile nöbetçi personel tespit edilir, NvDCF ile takip ID'si verilir. PERCLOS + EAR + pitch hesaplanır.",
  },
  {
    n: "02",
    icon: Cloud,
    title: "İhlal merkeze gönderilir",
    body:
      "Güvenlik personelinin gözleri kapalı, hareketsiz veya uykulu durumuna geçtiği an, başlangıç anının 1080p fotosu Bearer-token'lı multipart isteğiyle backend'e gönderilir.",
  },
  {
    n: "03",
    icon: Monitor,
    title: "Güvenlik amiri görür",
    body:
      "Backend yeni event'i veritabanına yazar, fotoyu diske kaydeder, merkez ofiste açık tarayıcılara WebSocket üzerinden push eder. Toast + kart + tıklanabilir kanıt.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-b border-zinc-200 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Üç adımda canlı izleme.
          </h2>
          <p className="mt-4 text-zinc-600">
            Mimari sade tutuldu: kenar AI, idempotent kuyruk, tek WebSocket
            kanalı. Hiçbir adımda buluta veya 3. parti SaaS'a bağımlılık yok.
          </p>
        </div>
        <ol className="mt-16 grid gap-6 lg:grid-cols-3">
          {STEPS.map(({ n, icon: Icon, title, body }) => (
            <li
              key={n}
              className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-500">{n}</span>
                <span className="grid h-9 w-9 place-items-center rounded-md bg-zinc-100 ring-1 ring-zinc-200">
                  <Icon className="h-4 w-4 text-zinc-700" />
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-zinc-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
