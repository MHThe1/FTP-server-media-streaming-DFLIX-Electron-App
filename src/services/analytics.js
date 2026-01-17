
import Analytics from 'electron-google-analytics4';

// Initialize with a placeholder or environment variable
// User needs to replace 'G-XXXXXXXXXX' with their actual Measurement ID
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-XXXXXXXXXX';
const API_SECRET = import.meta.env.VITE_GA_API_SECRET; // Optional, for verification

// Create instance
const analytics = new Analytics(MEASUREMENT_ID, API_SECRET);

// Helper to keep track of initialization
let isInitialized = false;

/**
 * Initialize Analytics
 * We can do any setup here if needed, but the instance is already created.
 */
export const initAnalytics = async () => {
  if (MEASUREMENT_ID === 'G-XXXXXXXXXX') {
    console.warn('Analytics: Measurement ID not set. Analytics disabled.');
    return;
  }
  
  try {
    // Optional: Set default user properties or validate
    console.log('Analytics: Initialized with ID', MEASUREMENT_ID);
    isInitialized = true;
  } catch (err) {
    console.error('Analytics: Initialization failed', err);
  }
};

/**
 * Track a Screen View
 * @param {string} screenName - Name of the screen (e.g., 'Home', 'Player')
 */
export const trackScreenView = (screenName) => {
  if (!isInitialized) return;
  
  // Set params then send event
  analytics.set('screen_name', screenName);
  analytics.event('screen_view')
    .catch(err => console.error('Analytics: Failed to track screen view', err));
};

/**
 * Track a Custom Event
 * @param {string} eventName - Event name/category (e.g., 'play_video', 'search')
 * @param {object} params - Additional parameters
 */
export const trackEvent = (eventName, params = {}) => {
  if (!isInitialized) return;
  
  // Create a temporary instance or just set/unset params? 
  // The library stores params in `this.customParams`.
  // If we set params, they persist for future events!
  // We should set params, send event, then maybe clear them if they are unique to this event.
  // However, for simplicity and since we track few events:
  analytics.setParams(params);
  
  analytics.event(eventName)
    .then(() => {
        // Optional: clear params after sending if we don't want them persisting
        // But the library doesn't have a clearParams method, only setParams({}).
        analytics.setParams({}); 
    })
    .catch(err => console.error('Analytics: Failed to track event', err));
};

export const analyticsService = {
  init: initAnalytics,
  screenView: trackScreenView,
  event: trackEvent
};
