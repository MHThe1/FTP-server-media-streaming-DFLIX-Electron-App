import { useState, useEffect } from 'react';
import { userContent } from '../services/userContent';

export const useUserLists = () => {
    const [userLists, setUserLists] = useState({
        continueWatching: userContent.getContinueWatching(),
        favorites: userContent.getFavorites(),
        watchLater: userContent.getWatchLater()
    });
  
    useEffect(() => {
       const handleUpdate = () => {
           setUserLists({
              continueWatching: userContent.getContinueWatching(),
              favorites: userContent.getFavorites(),
              watchLater: userContent.getWatchLater()
           });
       };
       window.addEventListener('user-content-updated', handleUpdate);
       handleUpdate();
       return () => window.removeEventListener('user-content-updated', handleUpdate);
    }, []);

    return userLists;
};
