import React, { useState, useEffect, useRef } from 'react';
import HeroSection from './HeroSection';

const HeroCarousel = ({ items, onPlay, onInfo }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSliding, setIsSliding] = useState(false);
  const timerRef = useRef(null);
  const transitionTimerRef = useRef(null);

  // Auto-rotate every 30 seconds
  useEffect(() => {
    if (!items || items.length < 2) return;

    timerRef.current = setInterval(() => {
       if (!isSliding) {
           setIsSliding(true);
           
           // Transition Duration
           transitionTimerRef.current = setTimeout(() => {
               setIsSliding(false);
               setCurrentIndex(prev => (prev + 1) % items.length);
           }, 1000);
       }
    }, 30000); 

    return () => {
        clearInterval(timerRef.current);
        clearTimeout(transitionTimerRef.current);
    };
  }, [items, isSliding]);

  if (!items || items.length === 0) return null;
  if (items.length === 1) return <HeroSection item={items[0]} onPlay={onPlay} onInfo={onInfo} className="mb-8" isActive={true} />;

  return (
    <div className="relative w-full h-[60vh] sm:h-[70vh] md:h-[85vh] mb-8 overflow-hidden bg-black">
        {items.map((item, index) => {
            const isCurrent = index === currentIndex;
            const nextIndex = (currentIndex + 1) % items.length;
            const isNext = index === nextIndex;

            // Only render Current and Next
            if (!isCurrent && !isNext) return null;

            let opacityClass = 'opacity-0'; 
            let zClass = 'z-0';
            let pointerEvents = 'pointer-events-none';

            if (isCurrent) {
                // Cross-fade: Exiting item fades OUT.
                opacityClass = isSliding ? 'opacity-0' : 'opacity-100';
                zClass = 'z-10';
                pointerEvents = isSliding ? 'pointer-events-none' : 'pointer-events-auto';
            } else if (isNext) {
                // Cross-fade: Entering item fades IN.
                opacityClass = isSliding ? 'opacity-100' : 'opacity-0';
                zClass = 'z-20'; // On top
                pointerEvents = isSliding ? 'pointer-events-auto' : 'pointer-events-none';
            }
            
            // Current is always active. Next is active ONLY during slide.
            const isActive = isCurrent || (isNext && isSliding);

            return (
                <HeroSection 
                    key={item.path || item.id || index}
                    item={item} 
                    onPlay={onPlay} 
                    onInfo={onInfo} 
                    isActive={isActive}
                    // Transition opacity. Added bg-black to avoid see-through.
                    className={`absolute inset-0 bg-black transition-opacity duration-1000 ease-in-out ${opacityClass} ${zClass} ${pointerEvents}`}
                />
            );
        })}
    </div>
  );
};

export default HeroCarousel;
