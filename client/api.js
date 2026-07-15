// Livingstone International School - API Utility
const API_BASE_URL = "https://your-api-url.com/api"; // You will change this after deploying backend

const api = {
    // Helper to get the saved token
    getToken: () => localStorage.getItem('livingstone_token'),

    // Universal POST request
    post: async (endpoint, data) => {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${api.getToken()}`
            },
            body: JSON.stringify(data)
        });
        return response.json();
    },

    // Universal GET request
    get: async (endpoint) => {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${api.getToken()}`
            }
        });
        return response.json();
    }
};
