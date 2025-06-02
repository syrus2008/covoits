import os
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException, Depends, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
from dotenv import load_dotenv
import json
import os
import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Union, Any
import uuid
from pathlib import Path
import secrets

# Charger les variables d'environnement
load_dotenv()

# Configuration de l'application
APP_CONFIG = {
    "app_name": os.getenv("APP_NAME", "Covoiturage Festival"),
    "contact_email": os.getenv("CONTACT_EMAIL", "covoiturage.festival@gmail.com"),
    "secret_key": os.getenv("SECRET_KEY", "changez_ceci_par_une_cle_secrete_longue_et_aleatoire"),
    "algorithm": os.getenv("ALGORITHM", "HS256"),
    "access_token_expire_minutes": int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30)),
}

app = FastAPI()

# Configuration de l'email
EMAIL_CONFIG = {
    "sender_email": os.getenv("SMTP_USERNAME", "covoiturage.festival@gmail.com"),
    "smtp_server": os.getenv("SMTP_SERVER", "smtp.gmail.com"),
    "smtp_port": int(os.getenv("SMTP_PORT", 587)),
    "smtp_username": os.getenv("SMTP_USERNAME", "covoiturage.festival@gmail.com"),
    "smtp_password": os.getenv("SMTP_PASSWORD", ""),
}

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # À restreindre en production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modèles Pydantic pour la validation des données
class ContactRequest(BaseModel):
    driverId: str
    trajetId: str
    name: str
    email: str
    message: Optional[str] = None

class ContactResponse(BaseModel):
    success: bool
    message: str

# Configuration des fichiers statiques
app.mount("/static", StaticFiles(directory="frontend"), name="static")
app.mount("/images", StaticFiles(directory="images"), name="images")

FESTIVALS_FILE = "backend/data/festivals.json"
TRAJETS_FILE = "backend/data/trajets.json"

# Gestion des connexions WebSocket
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_names: Dict[WebSocket, str] = {}
        self.chat_history: List[dict] = []
        self.chat_history_file = "backend/data/chat_history.json"
        self.forbidden_usernames = [
            'admin', 'administrateur', 'modo', 'moderator', 'modérateur', 'sysadmin',
            'root', 'system', 'server', 'bot', 'staff', 'support', 'help', 'service',
            'assistance', 'webmaster', 'modération', 'moderacion', 'moderazione',
            'moderator', 'moderatore', 'админ', 'модератор', '管理员', '管理者',
            '운영자', '관리자', '管理者', 'モデレーター'
        ]
        self._load_chat_history()
    
    def is_username_forbidden(self, username: str) -> bool:
        """Vérifie si un nom d'utilisateur contient des termes interdits"""
        if not username:
            return False
        lower_username = username.lower()
        return any(
            term in lower_username or 
            lower_username == term or
            lower_username.startswith(f"{term}_") or
            lower_username.endswith(f"_{term}") or
            f"_{term}_" in lower_username
            for term in self.forbidden_usernames
        )
    
    def _load_chat_history(self):
        try:
            if os.path.exists(self.chat_history_file):
                with open(self.chat_history_file, "r", encoding="utf-8") as f:
                    self.chat_history = json.load(f)
        except Exception as e:
            print(f"Erreur lors du chargement de l'historique du chat: {e}")
            self.chat_history = []
    
    def _save_chat_history(self):
        try:
            os.makedirs(os.path.dirname(self.chat_history_file), exist_ok=True)
            with open(self.chat_history_file, "w", encoding="utf-8") as f:
                json.dump(self.chat_history[-100:], f, ensure_ascii=False, indent=2)  # Garder les 100 derniers messages
        except Exception as e:
            print(f"Erreur lors de la sauvegarde de l'historique du chat: {e}")

    async def connect(self, websocket: WebSocket, username: str = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        
        # Vérifier si le nom d'utilisateur est valide
        if username and self.is_username_forbidden(username):
            await websocket.send_json({
                "type": "error",
                "message": "Ce nom d'utilisateur n'est pas autorisé"
            })
            username = None
        
        # Générer un nom d'utilisateur par défaut si nécessaire
        if not username or self.is_username_forbidden(username):
            username = f"User-{len(self.active_connections)}"
        
        self.user_names[websocket] = username
        
        # Envoyer l'historique au nouveau connecté
        await websocket.send_json({
            "type": "history", 
            "messages": self.chat_history,
            "username": username  # Envoyer le nom d'utilisateur assigné
        })
        return username

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            if websocket in self.user_names:
                del self.user_names[websocket]

    async def broadcast(self, message: dict):
        # Ajouter le message à l'historique
        self.chat_history.append(message)
        self._save_chat_history()
        
        # Envoyer le message à tous les clients connectés
        for connection in self.active_connections:
            try:
                await connection.send_json({"type": "message", **message})
            except:
                self.disconnect(connection)

manager = ConnectionManager()

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("frontend/index.html", "r", encoding="utf-8") as f:
        content = f.read()
    headers = {"ngrok-skip-browser-warning": "true"}
    return HTMLResponse(content=content, headers=headers)

# Fonction pour envoyer un email
async def load_email_template(template_name: str, context: dict) -> str:
    """Charge un template d'email et remplace les variables."""
    try:
        template_path = os.path.join('backend', 'email_templates', f"{template_name}.html")
        with open(template_path, 'r', encoding='utf-8') as file:
            content = file.read()
            
        # Remplacement des variables du template
        for key, value in context.items():
            placeholder = '{{ ' + key + ' }}'
            content = content.replace(placeholder, str(value))
            
        return content
    except Exception as e:
        print(f"Erreur lors du chargement du template {template_name}: {str(e)}")
        # Retourne un template par défaut en cas d'erreur
        default_template = """
        <!DOCTYPE html>
        <html>
        <body>
            <h2>{{ subject }}</h2>
            <div>{{ message }}</div>
        </body>
        </html>
        """
        return default_template.replace('{{ subject }}', 'Notification')\
                                 .replace('{{ message }}', str(context.get('message', '')))

async def send_email(recipient_email: str, subject: str, body: str, is_html: bool = False) -> bool:
    """
    Envoie un email.
    
    Args:
        recipient_email: Adresse email du destinataire
        subject: Sujet de l'email
        body: Corps du message (peut être du texte brut ou HTML)
        is_html: Si True, le corps est traité comme du HTML
    """
    try:
        # Vérifier si les informations SMTP sont configurées
        smtp_config = {
            'smtp_server': os.getenv('SMTP_SERVER', 'smtp.gmail.com'),
            'smtp_port': int(os.getenv('SMTP_PORT', 587)),
            'smtp_username': os.getenv('SMTP_USERNAME', 'covoiturage.festival@gmail.com'),
            'smtp_password': os.getenv('SMTP_PASSWORD', '')
        }
        
        if not smtp_config['smtp_password']:
            print("Avertissement: Aucun mot de passe SMTP configuré. L'email ne sera pas envoyé.")
            print(f"Destinataire: {recipient_email}")
            print(f"Sujet: {subject}")
            print(f"Corps:\n{body}")
            return False

        # Création du message
        message = MIMEMultipart()
        message['From'] = smtp_config['smtp_username']
        message['To'] = recipient_email
        message['Subject'] = subject
        
        # Ajout du corps du message
        if is_html:
            message.attach(MIMEText(body, 'html', 'utf-8'))
        else:
            message.attach(MIMEText(body, 'plain', 'utf-8'))
        
        # Connexion au serveur SMTP
        with smtplib.SMTP(smtp_config['smtp_server'], smtp_config['smtp_port']) as server:
            server.starttls()
            server.login(smtp_config['smtp_username'], smtp_config['smtp_password'])
            server.send_message(message)
            
        print(f"Email envoyé avec succès à {recipient_email}")
        return True
    except Exception as e:
        print(f"Erreur lors de l'envoi de l'email: {str(e)}")
        return False

# Fonction pour charger les informations d'un trajet depuis le fichier JSON
async def load_trajet(trajet_id: str) -> Optional[Dict]:
    try:
        with open(TRAJETS_FILE, 'r', encoding='utf-8') as f:
            trajets = json.load(f)
        
        # Rechercher le trajet par ID
        for trajet in trajets:
            if str(trajet.get('id')) == str(trajet_id):
                return trajet
        return None
    except Exception as e:
        print(f"Erreur lors du chargement du trajet: {e}")
        return None

# Route pour la demande de contact
@app.post("/api/contact-request", response_model=ContactResponse)
async def contact_request(contact: ContactRequest):
    try:
        # Charger les informations du trajet depuis le fichier JSON
        with open('backend/data/trajets.json', 'r', encoding='utf-8') as f:
            try:
                trajets = json.load(f)
            except json.JSONDecodeError:
                raise HTTPException(status_code=500, detail="Erreur de lecture des trajets")
        
        # Trouver le trajet correspondant
        trajet = next((t for t in trajets if str(t.get('id')) == contact.trajetId), None)
        if not trajet:
            raise HTTPException(status_code=404, detail="Trajet non trouvé")
        
        # Charger les informations du festival
        with open('backend/data/festivals.json', 'r', encoding='utf-8') as f:
            try:
                festivals = json.load(f)
                festival = next((f for f in festivals if f['id'] == trajet.get('festival_id')), {})
            except (json.JSONDecodeError, StopIteration):
                festival = {}
        
        # Formater les informations du trajet pour l'email
        date_depart = trajet.get('date_trajet', '')
        if date_depart:
            try:
                date_obj = datetime.strptime(date_depart, '%Y-%m-%d')
                date_depart = date_obj.strftime('%d/%m/%Y')
            except (ValueError, TypeError):
                pass

        # Préparer le contexte pour les templates d'email
        driver_context = {
            'festival_name': festival.get('nom', 'Non spécifié'),
            'date_depart': date_depart,
            'departure': trajet.get('adresses', [''])[0],
            'arrival': festival.get('lieu', ''),
            'passenger_name': contact.name,
            'passenger_email': contact.email,
            'passenger_message': contact.message or '',
            'support_email': 'covoiturage.festival@gmail.com'
        }

        passenger_context = {
            'passenger_name': contact.name,
            'festival_name': festival.get('nom', 'Non spécifié'),
            'date_depart': date_depart,
            'departure': trajet.get('adresses', [''])[0],
            'arrival': festival.get('lieu', ''),
            'trip_type': 'Aller-retour' if trajet.get('aller_retour', False) else 'Aller simple',
            'driver_name': trajet.get('contact', 'Non spécifié'),
            'driver_phone': trajet.get('telephone', ''),
            'driver_email': trajet.get('contact_email', ''),
            'driver_message': trajet.get('message', ''),
            'support_email': 'covoiturage.festival@gmail.com'
        }

        # Charger les templates d'email
        driver_email_html = await load_email_template('driver_notification', driver_context)
        passenger_email_html = await load_email_template('passenger_confirmation', passenger_context)

        # Envoyer les emails
        email_sent = True
        
        # Email au conducteur
        if trajet.get('contact_email'):
            email_sent = await send_email(
                recipient_email=trajet['contact_email'],
                subject="[Covoiturage Festival] Nouvelle demande pour votre trajet",
                body=driver_email_html,
                is_html=True
            )
        
        # Email de confirmation au passager
        if email_sent:
            email_sent = await send_email(
                recipient_email=contact.email,
                subject="[Covoiturage Festival] Confirmation de votre demande",
                body=passenger_email_html,
                is_html=True
            )
        
        if not email_sent:
            raise HTTPException(status_code=500, detail="Erreur lors de l'envoi des emails")
        
        return {"success": True, "message": "Votre demande a été envoyée avec succès"}
        
    except HTTPException as he:
        print(f"Erreur HTTP: {str(he)}")
        raise
    except Exception as e:
        print(f"Erreur lors de l'envoi de la demande de contact: {str(e)}")
        raise HTTPException(status_code=500, detail="Une erreur est survenue lors de l'envoi de votre demande")

# Route WebSocket pour le chat"
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Recevoir le nom d'utilisateur lors de la connexion
    try:
        data = await websocket.receive_text()
        message_data = json.loads(data)
        username = message_data.get("username", "").strip()
    except:
        username = None
    
    username = await manager.connect(websocket, username)
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Mettre à jour le nom d'utilisateur si fourni
            if "username" in message_data and message_data["username"].strip():
                new_username = message_data["username"].strip()
                if new_username != username:
                    if manager.is_username_forbidden(new_username):
                        await websocket.send_json({
                            "type": "error",
                            "message": "Ce nom d'utilisateur n'est pas autorisé"
                        })
                    else:
                        username = new_username
                        manager.user_names[websocket] = username
                        # Informer l'utilisateur que le nom a été mis à jour
                        await websocket.send_json({
                            "type": "info",
                            "message": f"Votre nom d'utilisateur est maintenant {username}"
                        })
            
            # Créer le message
            message = {
                "username": username,
                "text": message_data.get("text", "").strip(),
                "timestamp": datetime.now().isoformat()
            }
            
            # Diffuser le message
            await manager.broadcast(message)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"Erreur WebSocket: {e}")
        manager.disconnect(websocket)

@app.get("/api/festivals")
async def get_festivals():
    with open(FESTIVALS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/api/festivals/{festival_id}")
async def get_festival(festival_id: int):
    with open(FESTIVALS_FILE, "r", encoding="utf-8") as f:
        festivals = json.load(f)
        for festival in festivals:
            if festival["id"] == festival_id:
                return festival
        raise HTTPException(status_code=404, detail="Festival non trouvé")

@app.get("/add-festival")
async def add_festival_page():
    return FileResponse("frontend/add_festival.html")

@app.get("/contact")
async def contact_form(driver_id: str, trajet_id: str):
    return FileResponse("frontend/contact_form.html")

# Configuration pour servir les fichiers statiques supplémentaires
app.mount("/contact.js", StaticFiles(directory="frontend"), name="contact_js")

# Route pour servir le fichier contact_form.html
@app.get("/contact_form.html")
async def serve_contact_form():
    return FileResponse("frontend/contact_form.html")

# Route pour servir le fichier contact.js
@app.get("/contact.js")
async def serve_contact_js():
    return FileResponse("frontend/contact.js")

@app.post("/api/festivals")
async def add_festival(request: Request):
    new_festival = await request.json()
    with open(FESTIVALS_FILE, "r+", encoding="utf-8") as f:
        festivals = json.load(f)
        new_festival["id"] = max(f["id"] for f in festivals) + 1 if festivals else 1
        festivals.append(new_festival)
        f.seek(0)
        json.dump(festivals, f, ensure_ascii=False, indent=4)
    return {"message": "Festival ajouté avec succès"}

@app.get("/api/trajets/{festival_id}")
async def get_trajets(festival_id: int):
    try:
        with open(TRAJETS_FILE, "r", encoding="utf-8") as f:
            try:
                trajets = json.load(f)
            except json.JSONDecodeError:
                return []
                
        # Filtrer les trajets par festival_id et formater la réponse
        result = []
        for trajet in trajets:
            if trajet.get("festival_id") == festival_id:
                # Créer une version formatée du trajet pour la réponse
                trajet_formatte = {
                    "id": trajet.get("id"),
                    "type": trajet.get("type", "aller"),
                    "adresses": trajet.get("adresses", []),
                    "heures": trajet.get("heures", []),
                    "places_par_arret": trajet.get("places_par_arret", []),
                    "places_disponibles": trajet.get("places_disponibles", 0),
                    "prix": trajet.get("prix", 0),
                    "commentaires": trajet.get("commentaires", ""),
                    "contact": trajet.get("contact", ""),
                    "date_creation": trajet.get("date_creation", ""),
                    "complet": trajet.get("complet", False)
                }
                result.append(trajet_formatte)
                
        return result
        
    except Exception as e:
        print(f"Erreur lors de la récupération des trajets: {str(e)}")
        return []

@app.post("/api/trajets")
async def add_trajet(request: Request):
    new_trajet = await request.json()
    
    # Validation des champs requis
    required_fields = ["festival_id", "type", "adresses", "heures", "places_par_arret", "places_disponibles", "contact", "secret", "date_trajet"]
    for field in required_fields:
        if field not in new_trajet:
            return {"error": f"Champ manquant: {field}"}, 400
            
    # Validation de la date du trajet
    try:
        trajet_date = datetime.strptime(new_trajet["date_trajet"], "%Y-%m-%d")
    except (ValueError, TypeError):
        return {"error": "Format de date invalide. Utilisez le format YYYY-MM-DD"}, 400
    
    # Validation des tableaux de données
    if len(new_trajet["adresses"]) < 2:
        return {"error": "Au moins deux adresses sont nécessaires (départ et arrivée)"}, 400
    
    if len(new_trajet["adresses"]) != len(new_trajet["heures"]) or len(new_trajet["adresses"]) != len(new_trajet["places_par_arret"]):
        return {"error": "Les tableaux d'adresses, d'heures et de places doivent avoir la même longueur"}, 400
    
    # Ajout d'un ID unique au trajet
    new_trajet["id"] = str(uuid.uuid4())
    new_trajet["date_creation"] = datetime.now().isoformat()
    # S'assurer que la date est au bon format
    new_trajet["date_trajet"] = trajet_date.isoformat()
    
    # Lecture et mise à jour du fichier des trajets
    try:
        with open(TRAJETS_FILE, "r+", encoding="utf-8") as f:
            try:
                trajets = json.load(f)
            except json.JSONDecodeError:
                trajets = []
                
            trajets.append(new_trajet)
            f.seek(0)
            json.dump(trajets, f, ensure_ascii=False, indent=4)
            f.truncate()
            
        return {"message": "Trajet ajouté avec succès", "id": new_trajet["id"]}
        
    except Exception as e:
        print(f"Erreur lors de l'ajout du trajet: {str(e)}")
        return {"error": f"Erreur lors de l'ajout du trajet: {str(e)}"}, 500

@app.put("/api/trajets/{festival_id}/complet")
async def mark_complet(festival_id: int, request: Request):
    data = await request.json()
    index = data["index"]
    secret = data["secret"]
    with open(TRAJETS_FILE, "r+", encoding="utf-8") as f:
        trajets = json.load(f)
        filtered = [t for t in trajets if t["festival_id"] == festival_id]
        actual = [i for i, t in enumerate(trajets) if t["festival_id"] == festival_id]
        if index < len(filtered):
            real_index = actual[index]
            if trajets[real_index].get("secret") == secret:
                trajets[real_index]["complet"] = True
                f.seek(0)
                f.truncate()
                json.dump(trajets, f, ensure_ascii=False, indent=4)
                return {"ok": True}
    return {"error": "Mot-clé incorrect"}

@app.post("/api/trajets/{festival_id}/delete")
async def delete_trajet(festival_id: int, request: Request):
    data = await request.json()
    index = data["index"]
    secret = data["secret"]
    with open(TRAJETS_FILE, "r+", encoding="utf-8") as f:
        trajets = json.load(f)
        filtered = [t for t in trajets if t["festival_id"] == festival_id]
        actual = [i for i, t in enumerate(trajets) if t["festival_id"] == festival_id]
        if index < len(filtered):
            real_index = actual[index]
            if trajets[real_index].get("secret") == secret:
                del trajets[real_index]
                f.seek(0)
                f.truncate()
                json.dump(trajets, f, ensure_ascii=False, indent=4)
                return {"ok": True}
    return {"error": "Mot-clé incorrect"}
