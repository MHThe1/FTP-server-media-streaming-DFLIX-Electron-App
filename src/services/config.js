const CONFIG_API_URL = import.meta.env.VITE_CONFIG_API_URL || 'http://localhost:8000/api/config';
const CACHE_KEY = 'betterflix_remote_config_v2';
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

export const configService = {
    async fetchConfig() {
        // Try Network First
        try {
            console.log('Fetching remote config from:', CONFIG_API_URL);
            const response = await fetch(CONFIG_API_URL);
            
            if (!response.ok) {
                throw new Error('Failed to fetch config');
            }

            const data = await response.json();
            
            // Update cache
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data
            }));

            return data;
        } catch (error) {
            console.warn('Remote config fetch failed, using fallback/cache:', error);
            
            // Fallback to cache (even if stale)
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                console.log('Using cached remote config as fallback');
                return JSON.parse(cached).data;
            }

            return null;
        }
    },

    // Helper to get announcement status
    getAnnouncement(config) {
        if (!config || !config.announcement || !config.announcement.enabled) return null;
        return config.announcement;
    },

    // Helper to get trending overrides
    getTrending(config) {
        if (!config || !config.trending || !config.trending.enabled) return null;
        return config.trending.items || [];
    }
};
