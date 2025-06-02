// Récupère les paramètres d'URL
const urlParams = new URLSearchParams(window.location.search);
const driverId = urlParams.get('driver_id');
const trajetId = urlParams.get('trajet_id');
const festivalId = urlParams.get('festival_id');

// Variables globales
let placesDisponibles = 1;

document.addEventListener('DOMContentLoaded', async function() {
    const form = document.getElementById('contactRequestForm');
    const successMessage = document.getElementById('successMessage');
    const placesInput = document.getElementById('places');
    const placesAvailableSpan = document.getElementById('places-available');
    
    // Vérifier que les paramètres requis sont présents
    if (!driverId || !trajetId) {
        alert('Paramètres manquants. Veuillez passer par la page du trajet pour effectuer cette action.');
        window.close();
        return;
    }
    
    // Pré-remplir les champs cachés
    if (driverId) document.getElementById('driverId').value = driverId;
    if (trajetId) document.getElementById('trajetId').value = trajetId;
    if (festivalId) document.getElementById('festivalId').value = festivalId;
    
    // Récupérer les détails du trajet pour obtenir le nombre de places disponibles
    try {
        const response = await fetch(`/api/trajets/${festivalId}`);
        if (response.ok) {
            const trajets = await response.json();
            const trajet = trajets.find(t => t.id === trajetId);
            if (trajet) {
                placesDisponibles = trajet.places_disponibles || 1;
                placesAvailableSpan.textContent = placesDisponibles;
                placesInput.max = placesDisponibles;
                placesInput.value = Math.min(1, placesDisponibles);
            }
        }
    } catch (error) {
        console.error('Erreur lors de la récupération des détails du trajet:', error);
    }
    
    // Valider le nombre de places saisi
    placesInput.addEventListener('change', function() {
        const placesDemandees = parseInt(this.value);
        if (placesDemandees > placesDisponibles) {
            this.value = placesDisponibles;
            alert(`Vous ne pouvez pas demander plus de ${placesDisponibles} place(s).`);
        } else if (placesDemandees < 1) {
            this.value = 1;
        }
    });
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const placesDemandees = parseInt(form.places.value);
        
        // Vérifier à nouveau le nombre de places disponibles
        if (placesDemandees > placesDisponibles) {
            alert(`Désolé, il ne reste que ${placesDisponibles} place(s) disponible(s).`);
            return;
        }
        
        const formData = {
            driverId: form.driverId.value,
            trajetId: form.trajetId.value,
            name: form.name.value,
            email: form.email.value,
            places_demandees: placesDemandees,
            message: form.message.value
        };
        
        try {
            const response = await fetch('/api/contact-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });
            
            if (response.ok) {
                form.style.display = 'none';
                successMessage.style.display = 'block';
            } else {
                alert('Une erreur est survenue. Veuillez réessayer.');
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Une erreur est survenue. Veuillez réessayer.');
        }
    });
});
