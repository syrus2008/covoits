// Récupère les paramètres d'URL
const urlParams = new URLSearchParams(window.location.search);
const driverId = urlParams.get('driverId');
const trajetId = urlParams.get('trajetId');

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('contactRequestForm');
    const successMessage = document.getElementById('successMessage');
    
    // Pré-remplir les champs cachés
    if (driverId) document.getElementById('driverId').value = driverId;
    if (trajetId) document.getElementById('trajetId').value = trajetId;
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = {
            driverId: form.driverId.value,
            trajetId: form.trajetId.value,
            name: form.name.value,
            email: form.email.value,
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
