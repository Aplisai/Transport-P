"""Génère un jeu de données réaliste de points relais répartis en France."""
import random

CARRIERS = {
    "mondial_relay": {"name": "Mondial Relay", "color": "#FF3366"},
    "chronopost": {"name": "Chronopost", "color": "#3399FF"},
    "la_poste": {"name": "La Poste", "color": "#FFCC00"},
    "dpd": {"name": "DPD", "color": "#FF3333"},
    "ups": {"name": "UPS", "color": "#FF9900"},
    "relais_colis": {"name": "Relais Colis", "color": "#00E676"},
    "colis_prive": {"name": "Colis Privé", "color": "#A855F7"},
}

# Villes françaises: nom, lat, lng, codes postaux
CITIES = [
    ("Paris", 48.8566, 2.3522, "75001"),
    ("Paris", 48.8666, 2.3333, "75009"),
    ("Paris", 48.8443, 2.3743, "75012"),
    ("Boulogne-Billancourt", 48.8352, 2.2409, "92100"),
    ("Saint-Denis", 48.9362, 2.3574, "93200"),
    ("Versailles", 48.8014, 2.1301, "78000"),
    ("Lyon", 45.7640, 4.8357, "69001"),
    ("Villeurbanne", 45.7719, 4.8902, "69100"),
    ("Marseille", 43.2965, 5.3698, "13001"),
    ("Marseille", 43.2851, 5.3800, "13006"),
    ("Aix-en-Provence", 43.5297, 5.4474, "13100"),
    ("Toulouse", 43.6047, 1.4442, "31000"),
    ("Bordeaux", 44.8378, -0.5792, "33000"),
    ("Nantes", 47.2184, -1.5536, "44000"),
    ("Lille", 50.6292, 3.0573, "59000"),
    ("Strasbourg", 48.5734, 7.7521, "67000"),
    ("Nice", 43.7102, 7.2620, "06000"),
    ("Rennes", 48.1173, -1.6778, "35000"),
    ("Montpellier", 43.6108, 3.8767, "34000"),
    ("Grenoble", 45.1885, 5.7245, "38000"),
    ("Dijon", 47.3220, 5.0415, "21000"),
    ("Angers", 47.4784, -0.5632, "49000"),
    ("Le Havre", 49.4944, 0.1079, "76600"),
    ("Reims", 49.2583, 4.0317, "51100"),
    ("Toulon", 43.1242, 5.9280, "83000"),
    ("Clermont-Ferrand", 45.7772, 3.0870, "63000"),
    ("Tours", 47.3941, 0.6848, "37000"),
    ("Nancy", 48.6921, 6.1844, "54000"),
    ("Orléans", 47.9029, 1.9093, "45000"),
    ("Rouen", 49.4432, 1.0999, "76000"),
]

SHOP_TYPES = [
    "Tabac Presse", "Superette", "Point Presse", "Épicerie", "Boulangerie",
    "Pressing", "Fleuriste", "Librairie", "Boutique", "Café-Tabac",
    "Supermarché", "Station Service", "Magasin de proximité", "Kiosque",
]
STREET_NAMES = [
    "rue de la République", "avenue Jean Jaurès", "boulevard Voltaire",
    "rue Victor Hugo", "place du Marché", "avenue de la Gare",
    "rue Gambetta", "cours Lafayette", "rue Nationale", "avenue de la Liberté",
    "rue Pasteur", "boulevard Carnot", "rue des Écoles", "place de la Mairie",
]
HOURS = [
    {"lun-ven": "09:00-19:00", "sam": "09:00-18:00", "dim": "Fermé"},
    {"lun-ven": "08:30-20:00", "sam": "09:00-19:00", "dim": "09:00-13:00"},
    {"lun-ven": "07:00-19:30", "sam": "07:00-19:00", "dim": "08:00-12:30"},
    {"lun-ven": "10:00-19:00", "sam": "10:00-18:00", "dim": "Fermé"},
]


def generate_points():
    random.seed(42)
    points = []
    pid = 1
    for city, lat, lng, cp in CITIES:
        # 6 à 9 points par ville, transporteurs variés
        n = random.randint(6, 9)
        carriers = list(CARRIERS.keys())
        for _ in range(n):
            carrier = random.choice(carriers)
            dlat = random.uniform(-0.02, 0.02)
            dlng = random.uniform(-0.025, 0.025)
            shop = random.choice(SHOP_TYPES)
            num = random.randint(1, 180)
            street = random.choice(STREET_NAMES)
            points.append({
                "id": f"pt-{pid:04d}",
                "carrier": carrier,
                "carrier_name": CARRIERS[carrier]["name"],
                "color": CARRIERS[carrier]["color"],
                "name": f"{shop} - {CARRIERS[carrier]['name']}",
                "address": f"{num} {street}",
                "postal_code": cp,
                "city": city,
                "lat": round(lat + dlat, 6),
                "lng": round(lng + dlng, 6),
                "hours": random.choice(HOURS),
                "phone": f"0{random.randint(1,5)} {random.randint(10,99)} {random.randint(10,99)} {random.randint(10,99)} {random.randint(10,99)}",
            })
            pid += 1
    return points


POINTS = generate_points()
