import React from 'react';

const HeroSection = ({ item, onPlay, onInfo }) => {
  if (!item) return null;

  return (
    <div className="relative h-[60vh] sm:h-[70vh] md:h-[85vh] w-full text-white mb-8">
      {/* Background Image */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-transparent z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f1419] via-transparent to-transparent z-10" />
        <img 
          src={item.backdropPath || item.posterPath} 
          alt={item.title} 
          className="w-full h-full object-cover object-top"
          onError={(e) => e.target.style.display = 'none'} // Fallback if no image
        />
      </div>

      {/* Content */}
      <div className="absolute z-20 top-[30%] left-4 sm:left-8 md:left-12 max-w-xl">
        <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold mb-4 filter drop-shadow-lg">
          {item.title || item.name}
        </h1>
        
        <div className="flex items-center gap-4 mb-4 text-sm sm:text-base font-medium">
             <span className="text-green-500 font-bold">{item.rating ? `${item.rating.toFixed(1)} Match` : ''}</span>
             <span className="text-white/80">{item.releaseDate ? new Date(item.releaseDate).getFullYear() : ''}</span>
        </div>

        <p className="text-white/90 text-sm sm:text-base md:text-lg mb-6 line-clamp-3 md:line-clamp-4 max-w-lg drop-shadow-md">
           {item.overview}
        </p>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => onPlay(item)}
            className="flex items-center gap-2 bg-white text-black px-6 py-2 md:py-3 rounded font-bold hover:bg-white/90 transition-colors"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
               <path d="M8 5v14l11-7z" />
            </svg>
            Play
          </button>
          
          <button 
            onClick={() => onInfo(item)}
            className="flex items-center gap-2 bg-gray-500/70 text-white px-6 py-2 md:py-3 rounded font-bold hover:bg-gray-500/50 transition-colors backdrop-blur-sm"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            More Info
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
