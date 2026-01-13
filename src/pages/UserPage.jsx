import React, { useState } from 'react';
import { useLibrary } from '../hooks/useLibrary';
import { useUserLists } from '../hooks/useUserLists';
import ContentRow from '../components/ContentRow';
import MediaModal from '../components/MediaModal';
import { userContent } from '../services/userContent';

const UserPage = ({ onBack, onPlay }) => {
    const { library, hydrateItems, loading } = useLibrary();
    const userLists = useUserLists();
    const [selectedItem, setSelectedItem] = useState(null);

    const continueWatching = hydrateItems(userLists.continueWatching);
    const favorites = hydrateItems(userLists.favorites);
    const watchLater = hydrateItems(userLists.watchLater);

    return (
        <div className="min-h-screen bg-[#141414] text-white overflow-x-hidden">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#141414]/90 backdrop-blur-md border-b border-white/10 px-4 py-4 md:px-12 flex items-center gap-4">
                <button 
                    onClick={onBack}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white shadow-lg border border-white/10">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                     </div>
                     <h1 className="text-2xl font-bold">My Library</h1>
                </div>
            </div>

            <div className="px-4 md:px-12 py-8 space-y-12">
                {/* Stats / Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <div className="bg-[#1a1a1a] p-6 rounded-lg border border-white/5">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">In Progress</span>
                        <div className="text-4xl font-bold mt-2 text-blue-500">{continueWatching.length}</div>
                    </div>
                    <div className="bg-[#1a1a1a] p-6 rounded-lg border border-white/5">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">Favorites</span>
                        <div className="text-4xl font-bold mt-2 text-red-500">{favorites.length}</div>
                    </div>
                    <div className="bg-[#1a1a1a] p-6 rounded-lg border border-white/5">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">Watch Later</span>
                        <div className="text-4xl font-bold mt-2 text-yellow-500">{watchLater.length}</div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                         <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <>
                        {continueWatching.length > 0 && (
                            <ContentRow 
                                title="Continue Watching" 
                                items={continueWatching}
                                onCardClick={setSelectedItem}
                                onRemove={(item) => {
                                    const pathToRemove = item.filePath || item.path;
                                    userContent.removeContinueWatching(pathToRemove);
                                }}
                            />
                        )}

                        {favorites.length > 0 && (
                            <ContentRow 
                                title="Favorites" 
                                items={favorites}
                                onCardClick={setSelectedItem}
                                onRemove={(item) => userContent.removeFromFavorites(item.path)}
                            />
                        )}

                        {watchLater.length > 0 && (
                            <ContentRow 
                                title="Watch Later" 
                                items={watchLater}
                                onCardClick={setSelectedItem}
                                onRemove={(item) => userContent.removeFromWatchLater(item.path)}
                            />
                        )}

                        {continueWatching.length === 0 && favorites.length === 0 && watchLater.length === 0 && (
                             <div className="text-center py-20 text-gray-500">
                                 <p className="text-xl">Your list is empty.</p>
                                 <p className="text-sm mt-2">Start watching movies or add them to your favorites!</p>
                             </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal */}
            {selectedItem && (
                <MediaModal 
                    item={selectedItem} 
                    onClose={() => setSelectedItem(null)} 
                    onPlay={(item) => {
                        setSelectedItem(null);
                        onPlay(item);
                    }} 
                />
            )}
        </div>
    );
};

export default UserPage;
