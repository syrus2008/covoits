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
    places_demandees: int = 1

class ReserverRequest(BaseModel):
    driverId: str
    trajetId: str
    name: str
    email: str
    phone: str
    message: Optional[str] = None
    places_demandees: int = 1  # Nombre de places demandées par le passager

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

def get_demandes_trajet(trajet_id: str) -> list:
    """Récupère toutes les demandes pour un trajet donné."""
    try:
        with open('backend/data/demandes.json', 'r', encoding='utf-8') as f:
            demandes = json.load(f)
        return [d for d in demandes if d.get('trajet_id') == trajet_id]
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def get_places_restantes(trajet_id: str) -> tuple[int, bool]:
    """
    Calcule le nombre de places restantes pour un trajet.
    Retourne (places_restantes, est_complet)
    """
    try:
        with open('backend/data/trajets.json', 'r', encoding='utf-8') as f:
            trajets = json.load(f)
        trajet = next((t for t in trajets if str(t.get('id')) == trajet_id), None)
        if not trajet:
            return 0, True
            
        places_totales = trajet.get('places_disponibles', 0)
        demandes = get_demandes_trajet(trajet_id)
        places_prises = sum(d.get('places_demandees', 0) for d in demandes)
        
        places_restantes = max(0, places_totales - places_prises)
        est_complet = places_restantes <= 0
        
        return places_restantes, est_complet
        
    except Exception as e:
        print(f"Erreur lors du calcul des places restantes: {str(e)}")
        return 0, True

@app.get("/api/places-disponibles/{trajet_id}")
async def get_places_disponibles(trajet_id: str):
    """
    Retourne le nombre de places disponibles pour un trajet donné.
    """
    try:
        places_restantes, est_complet = get_places_restantes(trajet_id)
        return {
            "trajet_id": trajet_id,
            "places_restantes": places_restantes,
            "est_complet": est_complet
        }
    except Exception as e:
        print(f"Erreur lors de la récupération des places disponibles: {str(e)}")
        raise HTTPException(status_code=500, detail="Erreur lors de la récupération des places disponibles")

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
            
        # Vérifier les places disponibles
        places_restantes, est_complet = get_places_restantes(contact.trajetId)
        if est_complet:
            raise HTTPException(status_code=400, detail="Désolé, ce trajet est déjà complet.")
            
        # Vérifier si le nombre de places demandées est valide
        if not hasattr(contact, 'places_demandees') or contact.places_demandees < 1:
            contact.places_demandees = 1  # Valeur par défaut
            
        if contact.places_demandees > places_restantes:
            raise HTTPException(
                status_code=400, 
                detail=f"Il ne reste que {places_restantes} place(s) disponible(s) pour ce trajet."
            )
        
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
            'places_restantes': places_restantes - contact.places_demandees,
            'passenger_name': contact.name,
            'passenger_email': contact.email,
            'passenger_message': contact.message or '',
            'places_demandees': contact.places_demandees,
            'support_email': 'covoiturage.festival@gmail.com'
        }

        # Calculer les places restantes après la réservation
        places_restantes_apres = max(0, places_restantes - contact.places_demandees)
        
        passenger_context = {
            'passenger_name': contact.name,
            'festival_name': festival.get('nom', 'Non spécifié'),
            'date_depart': date_depart,
            'departure': trajet.get('adresses', [''])[0],
            'arrival': festival.get('lieu', ''),
            'places_demandees': contact.places_demandees,
            'places_restantes': places_restantes_apres,
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

        # Enregistrer la demande
        try:
            with open('backend/data/demandes.json', 'r+', encoding='utf-8') as f:
                try:
                    demandes = json.load(f)
                except json.JSONDecodeError:
                    demandes = []
                
                nouvelle_demande = {
                    'id': str(len(demandes) + 1),
                    'trajet_id': contact.trajetId,
                    'passager_email': contact.email,
                    'passager_nom': contact.name,
                    'places_demandees': contact.places_demandees,
                    'date_demande': datetime.now().isoformat(),
                    'statut': 'en_attente'
                }
                demandes.append(nouvelle_demande)
                
                f.seek(0)
                json.dump(demandes, f, ensure_ascii=False, indent=2)
                f.truncate()
                
        except Exception as e:
            print(f"Erreur lors de l'enregistrement de la demande: {str(e)}")
            raise HTTPException(
                status_code=500, 
                detail="Une erreur est survenue lors de l'enregistrement de votre demande"
            )
        
        # Mettre à jour le nombre de places disponibles dans le trajet
        try:
            # Lire le fichier des trajets
            with open('backend/data/trajets.json', 'r', encoding='utf-8') as f:
                trajets = json.load(f)
            
            # Trouver et mettre à jour le trajet
            trajet_trouve = False
            for t in trajets:
                if str(t.get('id')) == contact.trajetId:
                    # Mettre à jour le nombre de places disponibles
                    places_actuelles = int(t.get('places_disponibles', 0))
                    nouvelles_places = max(0, places_actuelles - contact.places_demandees)
                    t['places_disponibles'] = nouvelles_places
                    
                    # Mettre à jour le statut si nécessaire
                    if nouvelles_places <= 0:
                        t['statut'] = 'complet'
                    
                    trajet_trouve = True
                    break
            
            # Écrire les modifications dans le fichier
            if trajet_trouve:
                with open('backend/data/trajets.json', 'w', encoding='utf-8') as f:
                    json.dump(trajets, f, ensure_ascii=False, indent=2)
                print(f"Mise à jour du trajet {contact.trajetId}: {places_actuelles} -> {nouvelles_places} places")
            else:
                print(f"Avertissement: Trajet {contact.trajetId} non trouvé pour la mise à jour des places")
                    
        except Exception as e:
            print(f"Erreur lors de la mise à jour des places disponibles: {str(e)}")
            # Ne pas échouer la requête à cause de cette erreur, juste la logger
        
        # Mettre à jour le contexte avec les places restantes
        driver_context['places_restantes'] = max(0, places_restantes - contact.places_demandees)
        passenger_context['places_restantes'] = driver_context['places_restantes']
        
        # Recharger les templates avec le contexte mis à jour
        driver_email_html = await load_email_template('driver_notification', driver_context)
        passenger_email_html = await load_email_template('passenger_confirmation', passenger_context)
        
        # Envoyer les emails avec un délai entre chaque envoi
        email_sent = True
        
        # Fonction pour envoyer un email avec gestion des erreurs
        async def safe_send_email(recipient, subject, body, is_html=False, recipient_type=""):
            try:
                print(f"Tentative d'envoi d'email à {recipient_type}: {recipient}")
                success = await send_email(
                    recipient_email=recipient,
                    subject=subject,
                    body=body,
                    is_html=is_html
                )
                if success:
                    print(f"Email envoyé avec succès à {recipient_type}: {recipient}")
                else:
                    print(f"Échec de l'envoi de l'email à {recipient_type}: {recipient}")
                return success
            except Exception as e:
                print(f"Erreur lors de l'envoi de l'email à {recipient_type} {recipient}: {str(e)}")
                return False
        
        # Envoyer d'abord l'email au conducteur
        driver_email_sent = False
        if trajet.get('contact_email'):
            driver_subject = f"[Covoiturage Festival] Nouvelle réservation pour votre trajet ({places_restantes} place(s) restante(s))" if places_restantes > 0 else "[Covoiturage Festival] Votre trajet est maintenant complet !"
            driver_email_sent = await safe_send_email(
                recipient=trajet['contact_email'],
                subject=driver_subject,
                body=driver_email_html,
                is_html=True,
                recipient_type="conducteur"
            )
            # Attendre un court instant avant d'envoyer le prochain email
            import asyncio
            await asyncio.sleep(2)  # Pause de 2 secondes
        else:
            print("Aucune adresse email de conducteur trouvée pour l'envoi de la notification")
        
        # Ensuite, envoyer l'email de confirmation au passager
        passenger_email_sent = await safe_send_email(
            recipient=contact.email,
            subject=f"[Covoiturage Festival] Confirmation de votre réservation ({contact.places_demandees} place(s))",
            body=passenger_email_html,
            is_html=True,
            recipient_type="passager"
        )
        
        if not passenger_email_sent:
            email_sent = False
        
        if not email_sent:
            raise HTTPException(status_code=500, detail="Erreur lors de l'envoi des emails")
        
        return {"success": True, "message": "Votre demande a été envoyée avec succès"}
        
    except HTTPException as he:
        print(f"Erreur HTTP: {str(he)}")
        raise
    except Exception as e:
        print(f"Erreur lors de l'envoi de la demande de contact: {str(e)}")
        raise HTTPException(status_code=500, detail="Une erreur est survenue lors de l'envoi de votre demande")

# Route pour la réservation de place
@app.post("/api/reserver", response_model=ContactResponse)
async def reserver_place(reservation: ReserverRequest):
    try:
        # Convertir la réservation en demande de contact pour réutiliser la même logique
        contact = ContactRequest(
            driverId=reservation.driverId,
            trajetId=reservation.trajetId,
            name=reservation.name,
            email=reservation.email,
            message=reservation.message,
            places_demandees=reservation.places_demandees
        )
        
        # Appeler la fonction contact_request avec les données de la réservation
        return await contact_request(contact)
        
    except HTTPException as he:
        print(f"Erreur HTTP: {str(he)}")
        raise
    except Exception as e:
        print(f"Erreur lors du traitement de la réservation: {str(e)}")
        raise HTTPException(status_code=500, detail="Une erreur est survenue lors du traitement de votre réservation")

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
async def contact_form(driver_id: str = None, trajet_id: str = None, festival_id: str = None):
    # Vérifier que les paramètres requis sont présents
    if not driver_id or not trajet_id:
        raise HTTPException(
            status_code=400,
            detail="Paramètres manquants. Veuillez fournir driver_id et trajet_id."
        )
    
    # Stocker les paramètres dans le contexte de la requête pour une utilisation ultérieure
    # (si nécessaire pour le traitement côté serveur)
    
    # Servir le formulaire de contact
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
async def get_trajets(festival_id: str):
    try:
        # Convertir festival_id en entier si c'est une chaîne de caractères
        try:
            festival_id_int = int(festival_id)
        except (ValueError, TypeError):
            print(f"Erreur: festival_id doit être un nombre (reçu: {festival_id})")
            return []
            
        with open(TRAJETS_FILE, "r", encoding="utf-8") as f:
            try:
                trajets = json.load(f)
            except json.JSONDecodeError:
                print("Erreur: Fichier de trajets corrompu")
                return []
                
        # Filtrer les trajets par festival_id et formater la réponse
        result = []
        for trajet in trajets:
            # Convertir le festival_id du trajet en entier pour la comparaison
            trajet_festival_id = trajet.get("festival_id")
            if isinstance(trajet_festival_id, str):
                try:
                    trajet_festival_id = int(trajet_festival_id)
                except (ValueError, TypeError):
                    continue
                    
            if trajet_festival_id == festival_id_int:
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
    try:
        new_trajet = await request.json()
        print(f"Nouveau trajet reçu: {new_trajet}")
        
        # Validation des champs requis
        required_fields = ["festival_id", "type", "adresses", "heures", "places_par_arret", "places_disponibles", "contact", "telephone", "secret", "date_trajet"]
        for field in required_fields:
            if field not in new_trajet:
                error_msg = f"Champ manquant: {field}"
                print(error_msg)
                return JSONResponse(status_code=400, content={"error": error_msg})
                
        # S'assurer que festival_id est un entier
        try:
            new_trajet["festival_id"] = int(new_trajet["festival_id"])
        except (ValueError, TypeError):
            error_msg = "L'ID du festival doit être un nombre"
            print(error_msg)
            return JSONResponse(status_code=400, content={"error": error_msg})
                
        # Validation du format de l'email
        if not isinstance(new_trajet["contact"], str) or "@" not in new_trajet["contact"] or "." not in new_trajet["contact"]:
            error_msg = "Format d'email invalide"
            print(error_msg)
            return JSONResponse(status_code=400, content={"error": error_msg})
            
        # Validation du format du téléphone (format international: +33612345678)
        import re
        phone_pattern = r'^\+[0-9]{1,3}[0-9]{8,15}$'
        if not isinstance(new_trajet["telephone"], str) or not re.match(phone_pattern, new_trajet["telephone"]):
            error_msg = "Format de téléphone invalide. Utilisez le format international (ex: +33612345678)"
            print(error_msg)
            return JSONResponse(status_code=400, content={"error": error_msg})
                
        # Validation de la date du trajet
        try:
            trajet_date = datetime.strptime(new_trajet["date_trajet"], "%Y-%m-%d")
        except (ValueError, TypeError) as e:
            error_msg = "Format de date invalide. Utilisez le format YYYY-MM-DD"
            print(f"{error_msg}: {str(e)}")
            return JSONResponse(status_code=400, content={"error": error_msg})
        
        # Validation des tableaux de données
        if not isinstance(new_trajet["adresses"], list) or len(new_trajet["adresses"]) < 2:
            error_msg = "Au moins deux adresses sont nécessaires (départ et arrivée)"
            print(error_msg)
            return JSONResponse(status_code=400, content={"error": error_msg})
        
        if (not isinstance(new_trajet["heures"], list) or 
            not isinstance(new_trajet["places_par_arret"], list) or
            len(new_trajet["adresses"]) != len(new_trajet["heures"]) or 
            len(new_trajet["adresses"]) != len(new_trajet["places_par_arret"])):
            error_msg = "Les tableaux d'adresses, d'heures et de places doivent avoir la même longueur"
            print(error_msg)
            return JSONResponse(status_code=400, content={"error": error_msg})
        
        # Ajout d'un ID unique au trajet
        new_trajet["id"] = str(uuid.uuid4())
        new_trajet["date_creation"] = datetime.now().isoformat()
        # S'assurer que la date est au bon format
        new_trajet["date_trajet"] = trajet_date.isoformat()
        
        # Ajout de l'ID du conducteur (généré de manière aléatoire)
        new_trajet["conducteur_id"] = str(uuid.uuid4())
        
        # Utiliser un chemin absolu pour le fichier de trajets
        trajets_file = "backend/data/trajets.json"
        
        # S'assurer que le fichier existe et est valide
        os.makedirs(os.path.dirname(trajets_file), exist_ok=True)
        if not os.path.exists(trajets_file):
            with open(trajets_file, 'w', encoding='utf-8') as f:
                json.dump([], f)
        
        # Lecture et mise à jour du fichier des trajets
        try:
            # Lire les trajets existants
            try:
                with open(trajets_file, 'r', encoding='utf-8') as f:
                    trajets = json.load(f)
                if not isinstance(trajets, list):
                    trajets = []
            except (json.JSONDecodeError, FileNotFoundError):
                print("Fichier de trajets corrompu ou introuvable, initialisation d'une nouvelle liste")
                trajets = []
            
            # Ajouter le nouveau trajet
            trajets.append(new_trajet)
            
            # Écrire dans le fichier
            with open(trajets_file, 'w', encoding='utf-8') as f:
                json.dump(trajets, f, ensure_ascii=False, indent=4, default=str)
            
            print(f"Trajet ajouté avec succès. ID: {new_trajet['id']}")
            return JSONResponse(status_code=200, content={"message": "Trajet ajouté avec succès", "id": new_trajet["id"]})
            
        except Exception as e:
            error_msg = f"Erreur lors de l'écriture du fichier: {str(e)}"
            print(error_msg)
            return JSONResponse(status_code=500, content={"error": error_msg})
            
    except json.JSONDecodeError:
        error_msg = "Format de données JSON invalide"
        print(error_msg)
        return JSONResponse(status_code=400, content={"error": error_msg})
        
    except Exception as e:
        error_msg = f"Erreur inattendue: {str(e)}"
        print(error_msg)
        return JSONResponse(status_code=500, content={"error": error_msg})

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