# Application client Agence Gacolet : cahier des charges

Version 01 du 30/10/2026 · document interne · à valider par Gabriel avant mise en ligne.

## 1. Objet

Une application que les clients de l'agence installent sur l'écran d'accueil de leur téléphone (application web installable, sans App Store). Elle remplace les allers-retours WhatsApp pour quatre choses : valider les publications, suivre les résultats, voir le planning et les livrables, envoyer des demandes.

Statut à trancher par Gabriel : outil offert aux clients actuels (compatible avec la règle des 90 jours d'agence.md) ou service vendu à part (interdit jusqu'au 21/12/2026).

## 2. Hébergement (décision du 30/10/2026)

- Infomaniak, hébergement web avec site Node.js, sur le compte de l'agence. Environ 10,91 CHF HT par mois (prix affiché le 30/10/2026), base MariaDB comprise, données en Suisse.
- L'emplacement gratuit de l'école de Clara n'est pas utilisé pour la version clients (compte non détenu par l'agence, usage scolaire).
- Adresse visée : app.agencegacolet.fr (sous-domaine à créer).

## 3. Fonctions de la version 1

### 3.1 Inscription par code
- L'agence crée le client dans l'espace agence : nom, formule, modules (réseaux, Meta ou les deux), identifiant de la marque Metricool, objectif mensuel de contacts qualifiés. Le code GAC-XXXX-XX est généré automatiquement.
- Au premier lancement, le client saisit son code, puis prénom, nom, entreprise, courriel, téléphone, puis le questionnaire (activité, zone, réseaux utilisés, objectif, clients types, moments pour tourner).
- Les réponses arrivent dans l'espace agence. Plusieurs personnes d'une même entreprise peuvent utiliser le même code.

### 3.2 Valider
- Lecture en direct du planning Metricool de la marque du client, 14 prochains jours, par le serveur avec la clé API de l'agence. Le client n'a besoin d'aucun compte Metricool.
- Les vraies vidéos et images s'affichent dans les cartes (elles se lisent depuis Metricool, sans copie).
- Valider ou Modifier en un geste. Chaque décision est enregistrée, datée et signée du nom de la personne : c'est la validation écrite exigée par le manuel.
- Relances : 24 h après l'envoi, puis à J-5 (version 1.1, notifications).
- Publication non validée : le bilan l'indique « préparée mais non publiée, faute de validation ».

### 3.3 Contacts Meta (clients en campagnes)
- Chaque contact reçu apparaît dans l'application. Le client indique s'il est qualifié ou non, selon la définition écrite de son contrat.
- Le décompte du mois sert au prorata des honoraires. Le budget est indiqué comme payé directement par le client à Meta.
- Version 1 : contacts ajoutés par l'agence dans l'espace agence. Version 1.1 : arrivée automatique depuis les formulaires Meta (webhook) avec notification « rappelez dans les 5 minutes ».

### 3.4 Planning et livrables
- Tournages, échéances, bilans : saisis dans l'espace agence.
- Livrables : lien vers le fichier validé dans le dossier partagé du client.

### 3.5 Demandes
- Type, message, photos ou vidéos jointes. La demande arrive dans l'espace agence, à transformer en tâche du gestionnaire sous 24 h ouvrées.
- Version 1.1 : message vocal transcrit et mis en forme par l'IA en idée de vidéo.

### 3.6 Résultats
- Réseaux : chiffres du mois, chacun avec sa source et sa période. Version 1 : saisis par l'agence. Version 1.1 : lus automatiquement dans Metricool.
- Meta : contacts qualifiés selon le contrat (pas le chiffre de Meta), objectif, dépense, coût par contact qualifié, source et période sous chaque chiffre.

### 3.7 Espace agence
- Page protégée par mot de passe : clients et codes, inscriptions, validations, demandes, contacts Meta, planning, livrables, résultats.

## 4. Versions suivantes (par ordre de priorité)

1. Notifications sur le téléphone (validation en attente, nouveau contact Meta).
2. Contacts Meta automatiques (formulaires Meta vers le serveur).
3. Validation renvoyée dans Metricool (statut de la publication).
4. Message vocal transcrit en idée de vidéo.
5. Bilan mensuel généré le 1er, relu par Gabriel, publié avant le 5.
6. Feuille de tournage envoyée 72 h avant, créneau confirmé par le client.
7. Lien et QR code pour demander des avis Google.

Écartés pour l'instant : assistant IA généraliste, paiement en ligne, outils d'automatisation payants en plus (Make, Zapier, n8n).

## 5. Technique

- Serveur Node.js (Express), base MariaDB, page unique installable (manifeste et service worker).
- Clé API Metricool stockée uniquement dans les variables du serveur, jamais dans l'application ni dans un fichier partagé.
- Chaque client ne voit que ses données (jeton de session lié à son code).
- Données personnelles : nom, courriel, téléphone des contacts clients. Mentionner l'application dans la politique de confidentialité de l'agence.

## 6. Ce qu'il faut de l'agence

- Accès Infomaniak (compte agence) : création de l'hébergement web, du site Node.js et de la base MariaDB.
- Accès API Metricool : vérifier que la formule de l'agence la comprend (paramètres du compte, rubrique API).
- Feu vert de Gabriel sur le statut (outil ou service) et le budget (environ 140 € HT par an).
- Relecture de Gabriel avant tout envoi de code à un client.

## 7. Points ouverts

- Chemins exacts de l'API Metricool à confirmer avec la clé (fichier src/metricool.js).
- Possibilité de connexion SSH à Infomaniak depuis le Mac de Matis pour les mises à jour automatiques.
- Définition écrite du contact qualifié pour Total Habitat 360 (à signer avant lancement).
- Comparaison avec la marque blanche Metricool, si Gabriel le souhaite.
