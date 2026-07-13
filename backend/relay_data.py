"""Génère une base réaliste de points relais couvrant toute la France."""
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

# Communes françaises: (nom, lat, lng, code postal, poids ~ taille de la ville)
CITIES = [
    ("Paris", 48.8566, 2.3522, "75001", 12), ("Paris", 48.8666, 2.3333, "75009", 10),
    ("Paris", 48.8443, 2.3743, "75012", 9), ("Paris", 48.8330, 2.3210, "75014", 9),
    ("Paris", 48.8790, 2.3450, "75018", 10),
    ("Boulogne-Billancourt", 48.8352, 2.2409, "92100", 6),
    ("Nanterre", 48.8924, 2.2065, "92000", 5), ("Créteil", 48.7900, 2.4550, "94000", 5),
    ("Saint-Denis", 48.9362, 2.3574, "93200", 6), ("Montreuil", 48.8638, 2.4485, "93100", 5),
    ("Argenteuil", 48.9470, 2.2470, "95100", 4), ("Versailles", 48.8014, 2.1301, "78000", 5),
    ("Cergy", 49.0360, 2.0780, "95000", 4), ("Évry-Courcouronnes", 48.6290, 2.4460, "91000", 4),
    ("Meaux", 48.9600, 2.8780, "77100", 3),
    ("Lyon", 45.7640, 4.8357, "69001", 10), ("Lyon", 45.7480, 4.8500, "69007", 8),
    ("Villeurbanne", 45.7719, 4.8902, "69100", 6), ("Vénissieux", 45.6970, 4.8850, "69200", 4),
    ("Saint-Étienne", 45.4397, 4.3872, "42000", 6), ("Grenoble", 45.1885, 5.7245, "38000", 6),
    ("Chambéry", 45.5646, 5.9178, "73000", 4), ("Annecy", 45.8992, 6.1294, "74000", 5),
    ("Valence", 44.9333, 4.8924, "26000", 4), ("Bourg-en-Bresse", 46.2050, 5.2260, "01000", 3),
    ("Marseille", 43.2965, 5.3698, "13001", 10), ("Marseille", 43.2851, 5.3800, "13006", 8),
    ("Marseille", 43.3400, 5.4000, "13013", 7), ("Aix-en-Provence", 43.5297, 5.4474, "13100", 6),
    ("Toulon", 43.1242, 5.9280, "83000", 6), ("Nice", 43.7102, 7.2620, "06000", 8),
    ("Cannes", 43.5528, 7.0174, "06400", 4), ("Antibes", 43.5808, 7.1250, "06600", 4),
    ("Avignon", 43.9493, 4.8055, "84000", 5), ("Nîmes", 43.8367, 4.3601, "30000", 5),
    ("Fréjus", 43.4330, 6.7370, "83600", 3),
    ("Toulouse", 43.6047, 1.4442, "31000", 9), ("Toulouse", 43.5900, 1.4600, "31400", 7),
    ("Montpellier", 43.6108, 3.8767, "34000", 7), ("Perpignan", 42.6887, 2.8948, "66000", 5),
    ("Béziers", 43.3440, 3.2160, "34500", 3), ("Tarbes", 43.2330, 0.0780, "65000", 3),
    ("Albi", 43.9290, 2.1480, "81000", 3), ("Montauban", 44.0180, 1.3550, "82000", 3),
    ("Carcassonne", 43.2130, 2.3490, "11000", 3), ("Pau", 43.2951, -0.3708, "64000", 4),
    ("Bordeaux", 44.8378, -0.5792, "33000", 8), ("Mérignac", 44.8380, -0.6440, "33700", 4),
    ("Pessac", 44.8060, -0.6310, "33600", 3), ("La Rochelle", 46.1603, -1.1511, "17000", 4),
    ("Limoges", 45.8336, 1.2611, "87000", 4), ("Poitiers", 46.5802, 0.3404, "86000", 4),
    ("Angoulême", 45.6490, 0.1560, "16000", 3), ("Niort", 46.3240, -0.4640, "79000", 3),
    ("Bayonne", 43.4930, -1.4750, "64100", 3), ("Périgueux", 45.1840, 0.7210, "24000", 3),
    ("Agen", 44.2020, 0.6160, "47000", 3),
    ("Nantes", 47.2184, -1.5536, "44000", 8), ("Saint-Nazaire", 47.2730, -2.2130, "44600", 3),
    ("Angers", 47.4784, -0.5632, "49000", 5), ("Le Mans", 48.0061, 0.1996, "72000", 4),
    ("Laval", 48.0730, -0.7690, "53000", 3), ("La Roche-sur-Yon", 46.6700, -1.4270, "85000", 3),
    ("Cholet", 47.0590, -0.8790, "49300", 3),
    ("Rennes", 48.1173, -1.6778, "35000", 6), ("Brest", 48.3904, -4.4861, "29200", 5),
    ("Quimper", 47.9960, -4.1030, "29000", 3), ("Lorient", 47.7480, -3.3660, "56100", 3),
    ("Vannes", 47.6580, -2.7600, "56000", 3), ("Saint-Malo", 48.6490, -2.0260, "35400", 3),
    ("Saint-Brieuc", 48.5140, -2.7650, "22000", 3),
    ("Lille", 50.6292, 3.0573, "59000", 8), ("Roubaix", 50.6900, 3.1740, "59100", 4),
    ("Tourcoing", 50.7240, 3.1610, "59200", 4), ("Dunkerque", 51.0340, 2.3770, "59140", 3),
    ("Valenciennes", 50.3580, 3.5230, "59300", 3), ("Amiens", 49.8942, 2.2957, "80000", 5),
    ("Arras", 50.2910, 2.7770, "62000", 3), ("Calais", 50.9480, 1.8560, "62100", 3),
    ("Boulogne-sur-Mer", 50.7260, 1.6140, "62200", 3), ("Beauvais", 49.4300, 2.0810, "60000", 3),
    ("Compiègne", 49.4180, 2.8260, "60200", 3),
    ("Strasbourg", 48.5734, 7.7521, "67000", 7), ("Mulhouse", 47.7500, 7.3400, "68100", 4),
    ("Colmar", 48.0790, 7.3580, "68000", 3), ("Metz", 49.1193, 6.1757, "57000", 5),
    ("Nancy", 48.6921, 6.1844, "54000", 5), ("Reims", 49.2583, 4.0317, "51100", 5),
    ("Troyes", 48.2970, 4.0740, "10000", 3), ("Châlons-en-Champagne", 48.9570, 4.3650, "51000", 3),
    ("Épinal", 48.1740, 6.4510, "88000", 3), ("Charleville-Mézières", 49.7620, 4.7260, "08000", 3),
    ("Thionville", 49.3580, 6.1680, "57100", 3),
    ("Dijon", 47.3220, 5.0415, "21000", 5), ("Besançon", 47.2378, 6.0241, "25000", 4),
    ("Belfort", 47.6380, 6.8630, "90000", 3), ("Chalon-sur-Saône", 46.7810, 4.8540, "71100", 3),
    ("Auxerre", 47.7980, 3.5730, "89000", 3), ("Nevers", 46.9900, 3.1590, "58000", 3),
    ("Mâcon", 46.3060, 4.8280, "71000", 3),
    ("Clermont-Ferrand", 45.7772, 3.0870, "63000", 5), ("Vichy", 46.1270, 3.4250, "03200", 3),
    ("Montluçon", 46.3400, 2.6060, "03100", 3), ("Aurillac", 44.9260, 2.4400, "15000", 2),
    ("Le Puy-en-Velay", 45.0430, 3.8850, "43000", 2), ("Moulins", 46.5670, 3.3330, "03000", 2),
    ("Orléans", 47.9029, 1.9093, "45000", 5), ("Tours", 47.3941, 0.6848, "37000", 5),
    ("Bourges", 47.0810, 2.3990, "18000", 3), ("Blois", 47.5860, 1.3350, "41000", 3),
    ("Chartres", 48.4440, 1.4890, "28000", 3), ("Châteauroux", 46.8110, 1.6910, "36000", 3),
    ("Rouen", 49.4432, 1.0999, "76000", 6), ("Le Havre", 49.4944, 0.1079, "76600", 5),
    ("Caen", 49.1829, -0.3707, "14000", 5), ("Cherbourg-en-Cotentin", 49.6390, -1.6160, "50100", 3),
    ("Évreux", 49.0270, 1.1510, "27000", 3), ("Dieppe", 49.9250, 1.0770, "76200", 2),
    ("Alençon", 48.4310, 0.0910, "61000", 2), ("Saint-Lô", 49.1160, -1.0910, "50000", 2),
    ("Ajaccio", 41.9192, 8.7386, "20000", 3), ("Bastia", 42.7028, 9.4508, "20200", 3),
]

SHOP_TYPES = [
    "Tabac Presse", "Superette", "Point Presse", "Épicerie", "Boulangerie",
    "Pressing", "Fleuriste", "Librairie", "Boutique", "Café-Tabac",
    "Supermarché", "Station Service", "Magasin de proximité", "Kiosque",
    "Cordonnerie", "Bureau de Tabac", "Presse & Loto", "Alimentation Générale",
]
STREET_NAMES = [
    "rue de la République", "avenue Jean Jaurès", "boulevard Voltaire",
    "rue Victor Hugo", "place du Marché", "avenue de la Gare",
    "rue Gambetta", "cours Lafayette", "rue Nationale", "avenue de la Liberté",
    "rue Pasteur", "boulevard Carnot", "rue des Écoles", "place de la Mairie",
    "rue Jean Moulin", "avenue Foch", "rue de Verdun", "boulevard Gambetta",
    "rue du Général Leclerc", "avenue de Paris", "rue Émile Zola", "rue Carnot",
]
HOURS = [
    {"lun-ven": "09:00-19:00", "sam": "09:00-18:00", "dim": "Fermé"},
    {"lun-ven": "08:30-20:00", "sam": "09:00-19:00", "dim": "09:00-13:00"},
    {"lun-ven": "07:00-19:30", "sam": "07:00-19:00", "dim": "08:00-12:30"},
    {"lun-ven": "10:00-19:00", "sam": "10:00-18:00", "dim": "Fermé"},
    {"lun-ven": "08:00-20:00", "sam": "08:00-20:00", "dim": "Fermé"},
    {"lun-ven": "09:30-18:30", "sam": "09:30-17:00", "dim": "Fermé"},
]


def generate_points():
    random.seed(42)
    points = []
    pid = 1
    carriers = list(CARRIERS.keys())
    for city, lat, lng, cp, weight in CITIES:
        # Chaque transporteur possède plusieurs points, proportionnel à la taille
        for carrier in carriers:
            n = max(1, random.randint(weight // 3, weight // 2 + 2))
            for _ in range(n):
                dlat = random.uniform(-0.03, 0.03)
                dlng = random.uniform(-0.04, 0.04)
                shop = random.choice(SHOP_TYPES)
                num = random.randint(1, 220)
                street = random.choice(STREET_NAMES)
                points.append({
                    "id": f"pt-{pid:05d}",
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
