"""add il ilce mahalle location tables

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

# Turkiye il verisi (81 il)
ILLER = [
    "Adana", "Adiyaman", "Afyonkarahisar", "Agri", "Amasya", "Ankara", "Antalya",
    "Artvin", "Aydin", "Balikesir", "Bilecik", "Bingol", "Bitlis", "Bolu",
    "Burdur", "Bursa", "Canakkale", "Cankiri", "Corum", "Denizli", "Diyarbakir",
    "Edirne", "Elazig", "Erzincan", "Erzurum", "Eskisehir", "Gaziantep", "Giresun",
    "Gumushane", "Hakkari", "Hatay", "Isparta", "Mersin", "Istanbul", "Izmir",
    "Kars", "Kastamonu", "Kayseri", "Kirklareli", "Kirsehir", "Kocaeli", "Konya",
    "Kutahya", "Malatya", "Manisa", "Kahramanmaras", "Mardin", "Mugla", "Mus",
    "Nevsehir", "Nigde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt",
    "Sinop", "Sivas", "Tekirdag", "Tokat", "Trabzon", "Tunceli", "Sanliurfa",
    "Usak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman",
    "Kirikkale", "Batman", "Sirnak", "Bartin", "Ardahan", "Igdir", "Yalova",
    "Karabuk", "Kilis", "Osmaniye", "Duzce",
]

# Her il icin temel ilceler (sadece il merkezi - geri kalani prod'da yuklenebilir)
# Format: {il_adi: [ilce_adi, ...]}
ILCELER_SAMPLE = {
    "Istanbul": ["Adalar", "Arnavutkoy", "Atasehir", "Avcilar", "Bagcilar", "Bahcelievler",
                 "Bakirkoy", "Basaksehir", "Bayrampasa", "Besiktas", "Beykoz", "Beylikduzu",
                 "Beyoglu", "Buyukcekmece", "Catalca", "Cekmekoy", "Esenler", "Esenyurt",
                 "Eyupsultan", "Fatih", "Gaziosmanpasa", "Gungoren", "Kadikoy", "Kagithane",
                 "Kartal", "Kucukcekmece", "Maltepe", "Pendik", "Sancaktepe", "Sariyer",
                 "Sile", "Silivri", "Sultanbeyli", "Sultangazi", "Sishane", "Tuzla",
                 "Umraniye", "Uskudar", "Zeytinburnu"],
    "Ankara": ["Akyurt", "Altindag", "Ayas", "Bala", "Beypazari", "Camlidere", "Cankaya",
               "Cubuk", "Elmadagi", "Etimesgut", "Evren", "Golbasi", "Gudul", "Haymana",
               "Kahramankazan", "Kizilcahamam", "Mamak", "Nallihan", "Polatli", "Pursaklar",
               "Sincan", "Sereflikochisar", "Yenimahalle"],
    "Izmir": ["Aliaga", "Balcova", "Bayindir", "Bayrakli", "Bergama", "Beydagi", "Bornova",
              "Buca", "Cesme", "Cigli", "Dikili", "Foca", "Guzelbahce", "Karabaglar",
              "Karaburun", "Karsis", "Kemalpasa", "Kinik", "Kiraz", "Kucukdal", "Menderes",
              "Menemen", "Narlidere", "Odemis", "Selcuk", "Seferihisar", "Torbali", "Tire",
              "Urla"],
}


def upgrade():
    op.create_table(
        "iller",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(64), nullable=False),
    )
    op.create_table(
        "ilceler",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("il_id", sa.Integer, sa.ForeignKey("iller.id", ondelete="CASCADE"), nullable=False),
    )
    op.create_table(
        "mahalleler",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("ilce_id", sa.Integer, sa.ForeignKey("ilceler.id", ondelete="CASCADE"), nullable=False),
    )

    # Seed iller
    conn = op.get_bind()
    for il_name in ILLER:
        conn.execute(sa.text("INSERT INTO iller (name) VALUES (:name)"), {"name": il_name})

    # Seed ilceler (oncelikli sehirler)
    for il_name, ilceler in ILCELER_SAMPLE.items():
        row = conn.execute(
            sa.text("SELECT id FROM iller WHERE name = :name"), {"name": il_name}
        ).fetchone()
        if row:
            il_id = row[0]
            for ilce_name in ilceler:
                conn.execute(
                    sa.text("INSERT INTO ilceler (name, il_id) VALUES (:name, :il_id)"),
                    {"name": ilce_name, "il_id": il_id},
                )
            # Her ilce icin merkez mahalle seed'i
            ilce_rows = conn.execute(
                sa.text("SELECT id, name FROM ilceler WHERE il_id = :il_id"), {"il_id": il_id}
            ).fetchall()
            for ilce_id, ilce_name in ilce_rows:
                conn.execute(
                    sa.text("INSERT INTO mahalleler (name, ilce_id) VALUES (:name, :ilce_id)"),
                    {"name": f"{ilce_name} Merkez", "ilce_id": ilce_id},
                )

    # Diger iller icin varsayilan ilce (il adi + Merkez)
    for il_name in ILLER:
        if il_name not in ILCELER_SAMPLE:
            row = conn.execute(
                sa.text("SELECT id FROM iller WHERE name = :name"), {"name": il_name}
            ).fetchone()
            if row:
                il_id = row[0]
                conn.execute(
                    sa.text("INSERT INTO ilceler (name, il_id) VALUES (:name, :il_id)"),
                    {"name": f"{il_name} Merkez", "il_id": il_id},
                )
                ilce_row = conn.execute(
                    sa.text("SELECT id FROM ilceler WHERE il_id = :il_id LIMIT 1"), {"il_id": il_id}
                ).fetchone()
                if ilce_row:
                    conn.execute(
                        sa.text("INSERT INTO mahalleler (name, ilce_id) VALUES (:name, :ilce_id)"),
                        {"name": f"{il_name} Merkez Mahallesi", "ilce_id": ilce_row[0]},
                    )


def downgrade():
    op.drop_table("mahalleler")
    op.drop_table("ilceler")
    op.drop_table("iller")
