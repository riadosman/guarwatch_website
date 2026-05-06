import { Camera, Radio, FileImage, Cpu, ServerCog, BellRing } from "lucide-react";

const FEATURES = [
  {
    icon: Camera,
    title: "Uçta görüntü işleme",
    body:
      "DeepStream + YOLO + MediaPipe ile her kare Jetson Nano üzerinde işlenir. Bulutu ya da internet bağlantısını beklemeden 30 FPS tespit.",
  },
  {
    icon: Radio,
    title: "Anlık WebSocket akışı",
    body:
      "Bir ihlal başladığı an panele toast düşer. Herhangi bir tarayıcı açık olan operatör için canlı uyarı.",
  },
  {
    icon: FileImage,
    title: "Kanıtlı kayıt",
    body:
      "İhlal anının 1080p JPEG fotosu otomatik kaydedilir, panelde tıklanabilir geçmiş listesi olarak tutulur.",
  },
  {
    icon: Cpu,
    title: "PERCLOS + EAR + Pose",
    body:
      "Klinik PERCLOS metriği, göz açıklık oranı (EAR) ve YOLO-Pose failsafe — tek bir sinyale bağlı kalmadan çapraz teyit.",
  },
  {
    icon: ServerCog,
    title: "Çok kulübeli izleme",
    body:
      "Tek panelden onlarca güvenlik kulübesindeki Jetson izlenir. Her kulübe kendi güvenli token'ı ile bağlanır, idempotent kuyrukla offline'a dayanır.",
  },
  {
    icon: BellRing,
    title: "Operatör odaklı UX",
    body:
      "Sade kart akışı, renk kodlu tip rozetleri, lightbox ile tek tıkta kanıt. Sürekli izleme yerine olay bazlı bildirim.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-b border-white/5 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Her kulübede yapay zeka, merkezde tek panel.
          </h2>
          <p className="mt-4 text-zinc-400">
            Her güvenlik kulübesindeki Jetson, nöbetçi personeli kendi başına
            izler; merkezi panel sadece ihlalleri toplar ve operatöre sunar.
          </p>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-xl border border-white/5 bg-white/[0.02] p-6 transition hover:border-white/10 hover:bg-white/[0.04]"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-red-500/10 ring-1 ring-red-500/20">
                <Icon className="h-5 w-5 text-red-300" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
