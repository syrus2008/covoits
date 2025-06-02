# Configuration de l'envoi d'emails

## Configuration requise

1. **Compte Gmail**
   - Créez un compte Gmail pour l'application (par exemple : covoiturage.festival@gmail.com)
   - Activez l'option "Accès moins sécurisé des applications" OU créez un mot de passe d'application

2. **Configuration des variables d'environnement**
   - Copiez le fichier `.env.example` vers `.env`
   - Remplissez les informations SMTP avec vos identifiants Gmail

## Configuration de Gmail

1. **Option 1 : Activer l'accès moins sécurisé**
   - Allez sur https://myaccount.google.com/lesssecureapps
   - Activez l'option "Activer l'accès pour les applications moins sécurisées"

2. **Option 2 (Recommandée) : Créer un mot de passe d'application**
   - Activez la vérification en deux étapes : https://myaccount.google.com/security
   - Créez un mot de passe d'application : https://myaccount.google.com/apppasswords
   - Sélectionnez "Autre (nom personnalisé)" et donnez un nom comme "Covoiturage Festival"
   - Utilisez le mot de passe généré dans le fichier `.env`

## Dépannage

- **Erreur d'authentification** : Vérifiez que le mot de passe est correct et que l'accès est autorisé
- **Bloqué par Google** : Vous pourriez recevoir un email de Google bloquant la connexion. Suivez les instructions pour autoriser l'accès.
- **Délai d'attente** : Vérifiez que les ports SMTP ne sont pas bloqués par votre pare-feu.
