import React from 'react';
import ReactPlayer from 'react-player';

const AnnouncementBanner = ({ announcement }) => {
    if (!announcement) return null;

    console.log('AnnouncementBanner render:', announcement);
    const { text, link, color, imageUrl, videoUrl } = announcement;
    const isMedia = !!(imageUrl || videoUrl);

    // Resolve image URL (handle local assets vs remote)
    let finalImageUrl = imageUrl;
    if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
        // Assume it's in public/ folder
        // For Electron/File protocol, we want relative path (no leading slash)
        finalImageUrl = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
    }

    // Common container style
    const containerStyle = {
        backgroundColor: color || '#dc2626',
        background: color && color.includes('gradient') ? color : undefined
    };

    const Content = () => (
        <div className="w-full h-full flex items-center justify-center">
            {isMedia ? (
                // Media Mode: Fixed height box (banner style)
                // User asked for "box and image fill it". 
                // We'll use a fixed height for consistency (e.g. h-48 or h-64)
                <div className="w-full relative h-48 md:h-64 overflow-hidden rounded-lg bg-black">
                    {videoUrl ? (
                         <div className="w-full h-full flex">
                             {/* Video on left/center - user said 'video can stay on left', potentially implying split? 
                                 For now, full width is safer unless specific split requested. 
                                 Keeping full width but ensuring fit.
                             */}
                             <ReactPlayer 
                                url={videoUrl}
                                width="100%"
                                height="100%"
                                playing={true}
                                loop={true}
                                muted={true}
                                controls={false}
                                playsinline={true}
                                style={{ objectFit: 'cover' }}
                            />
                         </div>
                    ) : (
                        <img 
                            src={finalImageUrl} 
                            alt={text || "Announcement"} 
                            className="w-full h-full object-cover block"
                        />
                    )}
                    
                    {/* Overlay text for media */}
                    {text && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 flex items-end justify-center h-1/2">
                            <span className="text-white font-bold text-lg md:text-2xl shadow-sm drop-shadow-md">{text}</span>
                        </div>
                    )}
                </div>
            ) : (
                // Text Only Mode
                <div className="py-4 px-6 text-center">
                     <span className="text-white font-bold text-lg md:text-xl">{text}</span>
                </div>
            )}
        </div>
    );

    if (link) {
        return (
            <a 
                href={link} 
                target="_blank" 
                rel="noopener noreferrer" 
                className={`block w-full mb-6 rounded-lg overflow-hidden shadow-lg transition-transform hover:scale-[1.01] ${!isMedia ? 'px-4' : ''}`}
                style={!isMedia ? containerStyle : {}}
            >
                <Content />
            </a>
        );
    }

    return (
        <div 
            className={`w-full mb-6 rounded-lg overflow-hidden shadow-lg ${!isMedia ? 'px-4' : ''}`}
            style={!isMedia ? containerStyle : {}}
        >
            <Content />
        </div>
    );
};

export default AnnouncementBanner;
