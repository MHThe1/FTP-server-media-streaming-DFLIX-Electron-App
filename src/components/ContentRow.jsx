import React, { useRef, useState } from 'react';
import MediaCard from './MediaCard';

const ContentRow = ({ title, items, onCardClick, onRemove }) => {
  const rowRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  
  const handleScroll = () => {
    if (rowRef.current) {
        setShowLeftArrow(rowRef.current.scrollLeft > 0);
    }
  };
  
  const slide = (direction) => {
    if (rowRef.current) {
        const { scrollLeft, clientWidth } = rowRef.current;
        const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
        rowRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="mb-8 pl-4 sm:pl-8 group">
      <h2 className="text-white text-lg sm:text-xl md:text-2xl font-semibold mb-3 hover:text-[#00A8E1] cursor-pointer transition-colors max-w-max">
        {title}
      </h2>
      
      <div className="relative">
        {/* Left Arrow */}
        <button 
            className={`absolute left-0 top-0 bottom-0 z-40 bg-black/50 hover:bg-black/70 w-12 flex items-center justify-center transition-all duration-300 ${showLeftArrow ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none'}`}
            onClick={() => slide('left')}
        >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
        </button>

        {/* Scroll Container */}
        <div 
            ref={rowRef}
            className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-4 px-1"
            onScroll={handleScroll}
        >
            {items.map((item, index) => (
                <MediaCard 
                    key={`${item.path}-${index}`} 
                    item={item} 
                    onClick={onCardClick}
                    onRemove={onRemove}
                />
            ))}
        </div>

        {/* Right Arrow */}
        <button 
            className="absolute right-0 top-0 bottom-0 z-40 bg-black/50 hover:bg-black/70 w-12 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300"
            onClick={() => slide('right')}
        >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
        </button>
      </div>
    </div>
  );
};

export default ContentRow;
