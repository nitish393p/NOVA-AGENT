import React, { useEffect, useRef, useState } from 'react';
import { CompanionStatus } from '../types/companion';

interface AiAvatarGraphicProps {
  gender: 'female' | 'male';
  status: CompanionStatus;
  userVolume: number;
  companionVolume: number;
  className?: string;
}

export const AiAvatarGraphic: React.FC<AiAvatarGraphicProps> = ({
  gender,
  status,
  userVolume,
  companionVolume,
  className = 'w-52 h-52 md:w-60 md:h-60',
}) => {
  const isSpeaking = status === 'speaking';
  const isListening = status === 'listening';
  const isThinking = status === 'thinking';

  // Smooth audio volume envelope & speech viseme phase tracking
  const [visemeOpen, setVisemeOpen] = useState(0);
  const [visemeWidth, setVisemeWidth] = useState(1);
  const animFrameRef = useRef<number | null>(null);
  const smoothedVolRef = useRef(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    let lastTime = performance.now();

    const updateLipSync = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const targetVol = isSpeaking ? Math.max(0, Math.min(1, companionVolume)) : 0;

      // Fast attack for natural speech onset, smooth natural decay
      if (targetVol > smoothedVolRef.current) {
        smoothedVolRef.current += (targetVol - smoothedVolRef.current) * Math.min(1, dt * 26);
      } else {
        smoothedVolRef.current += (targetVol - smoothedVolRef.current) * Math.min(1, dt * 12);
      }

      if (isSpeaking && smoothedVolRef.current > 0.02) {
        // Natural speech syllabic frequency (~4.3 Hz)
        phaseRef.current += dt * 24;
        const syllableMod = 0.5 + 0.5 * Math.sin(phaseRef.current);
        const openAmt = Math.min(1, Math.max(0, syllableMod * (smoothedVolRef.current * 1.55)));
        const widthAmt = 0.95 + 0.12 * Math.sin(phaseRef.current * 0.9);

        setVisemeOpen(openAmt);
        setVisemeWidth(widthAmt);
      } else {
        setVisemeOpen((prev) => Math.max(0, prev - dt * 9));
        setVisemeWidth((prev) => prev + (1 - prev) * dt * 6);
      }

      animFrameRef.current = requestAnimationFrame(updateLipSync);
    };

    animFrameRef.current = requestAnimationFrame(updateLipSync);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isSpeaking, companionVolume]);

  const companionVolClamped = Math.max(0, Math.min(1, companionVolume));
  const userVolClamped = Math.max(0, Math.min(1, userVolume));

  // Determine gesture animation class for head/presence
  const getGestureAnimationClass = () => {
    if (isListening && userVolClamped > 0.04) {
      // Actively nodding in empathy while hearing user speak
      return 'animate-avatar-nod';
    }
    if (isListening) {
      // Attentive slight head tilt when listening quietly
      return 'animate-avatar-tilt';
    }
    if (isSpeaking) {
      // Natural conversational head sway while speaking
      return 'animate-avatar-sway';
    }
    return 'animate-human-presence';
  };

  // Modern ambient aura glow
  const rimGlow = isSpeaking
    ? 0.9 + companionVolClamped * 0.1
    : isListening
    ? 0.7 + userVolClamped * 0.3
    : 0.5;

  if (gender === 'female') {
    // MODERN FEMALE AVATAR
    // Sculpted high Slavic cheekbones, captivating Baltic ice-blue almond eyes,
    // voluminous modern ash-blonde blowout waves, sleek black turtleneck & tailored coat
    const mouthHeight = Math.max(0, visemeOpen * 13);

    return (
      <div
        className={`relative flex items-center justify-center animate-avatar-breathe select-none ${className}`}
        style={{
          transform: isSpeaking ? `scale(${1 + companionVolClamped * 0.035})` : 'scale(1)',
          transition: 'transform 80ms ease-out',
        }}
      >
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full drop-shadow-[0_16px_40px_rgba(56,189,248,0.28)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Luminous Alabaster/Porcelain Slavic Skin with High-Fashion Contour */}
            <linearGradient id="russianWomanSkin" x1="25%" y1="0%" x2="75%" y2="100%">
              <stop offset="0%" stopColor="#fff5ee" />
              <stop offset="25%" stopColor="#fde2d2" />
              <stop offset="65%" stopColor="#f5c0a6" />
              <stop offset="90%" stopColor="#e29f80" />
              <stop offset="100%" stopColor="#c57b5c" />
            </linearGradient>

            {/* Sculpted Cheek Contour Shadow */}
            <linearGradient id="slavicCheekContour" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9e563a" stopOpacity="0.32" />
              <stop offset="50%" stopColor="#9e563a" stopOpacity="0" />
              <stop offset="100%" stopColor="#9e563a" stopOpacity="0.32" />
            </linearGradient>

            {/* Luminous Frost-Champagne Cheekbone Highlighter */}
            <radialGradient id="slavicHighlighter" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="35%" stopColor="#fde2d2" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#fde2d2" stopOpacity="0" />
            </radialGradient>

            {/* Captivating Baltic Ice-Blue Almond Eyes with Multi-Faceted Depth */}
            <radialGradient id="balticIceBlueIris" cx="42%" cy="36%" r="65%">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="25%" stopColor="#38bdf8" />
              <stop offset="60%" stopColor="#0284c7" />
              <stop offset="90%" stopColor="#0369a1" />
              <stop offset="100%" stopColor="#082f49" />
            </radialGradient>

            {/* Iris Inner Shimmer Ring */}
            <radialGradient id="iceIrisShimmer" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.8" />
              <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
            </radialGradient>

            {/* Chic Modern Ash-Blonde / Champagne Balayage Hair */}
            <linearGradient id="russianAshBlonde" x1="10%" y1="0%" x2="90%" y2="100%">
              <stop offset="0%" stopColor="#ebe1d3" />
              <stop offset="25%" stopColor="#d5c4b1" />
              <stop offset="60%" stopColor="#a9937f" />
              <stop offset="85%" stopColor="#725f4f" />
              <stop offset="100%" stopColor="#45382e" />
            </linearGradient>

            {/* Platinum-Champagne Hair Gloss Sheen */}
            <linearGradient id="russianBlondeGleam" x1="0%" y1="0%" x2="100%" y2="60%">
              <stop offset="0%" stopColor="#a9937f" stopOpacity="0" />
              <stop offset="45%" stopColor="#f5eee6" stopOpacity="0.85" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="75%" stopColor="#f5eee6" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#a9937f" stopOpacity="0" />
            </linearGradient>

            {/* Modern Velvet Rose-Mauve Lip Color */}
            <linearGradient id="russianRoseMauveLips" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="35%" stopColor="#e11d48" />
              <stop offset="80%" stopColor="#be123c" />
              <stop offset="100%" stopColor="#881337" />
            </linearGradient>

            {/* Modern Sleek Charcoal / Midnight Coat */}
            <linearGradient id="russianCoat" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#27272a" />
              <stop offset="45%" stopColor="#18181b" />
              <stop offset="85%" stopColor="#09090b" />
              <stop offset="100%" stopColor="#000000" />
            </linearGradient>

            {/* Polished Platinum/Silver Jewelry */}
            <linearGradient id="sleekSilver" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="40%" stopColor="#f8fafc" />
              <stop offset="70%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
          </defs>

          {/* Sleek Backdrop Ambient Rim */}
          <g opacity={rimGlow}>
            <circle cx="100" cy="98" r="82" fill="none" stroke="url(#sleekSilver)" strokeWidth="1" strokeDasharray="3 5" opacity="0.4" />
            <circle cx="30" cy="46" r="1.8" fill="#38bdf8" className="animate-pulse" />
            <circle cx="170" cy="46" r="1.8" fill="#a78bfa" className="animate-pulse" />
          </g>

          {/* Voluminous Cascading Ash-Blonde Wavy Hair Behind Shoulders */}
          <path
            d="M44 68 C28 94 24 140 36 178 C54 152 64 126 70 100 Z"
            fill="url(#russianAshBlonde)"
          />
          <path
            d="M156 68 C172 94 176 140 164 178 C146 152 136 126 130 100 Z"
            fill="url(#russianAshBlonde)"
          />

          {/* Slender Sculpted Slavic Neck with Elegant Shadow */}
          <path d="M88 112 L112 112 L116 148 L84 148 Z" fill="url(#russianWomanSkin)" />
          <path d="M88 112 Q100 120 112 112 L114 119 Q100 126 86 119 Z" fill="#9e563a" opacity="0.38" />

          {/* Minimalist Chic Platinum Choker Necklace */}
          <path d="M89 128 Q100 134 111 128" stroke="url(#sleekSilver)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <circle cx="100" cy="132" r="1.5" fill="url(#sleekSilver)" />

          {/* Modern Black Cashmere Turtleneck under Tailored Minimalist Coat */}
          {/* Inner Black Cashmere Turtleneck */}
          <path d="M78 140 L122 140 L132 198 L68 198 Z" fill="#09090b" />
          {/* Tailored Coat Shoulders and Lapels */}
          <path
            d="M44 146 C60 130 140 130 156 146 L176 198 L142 198 L122 152 L100 180 L78 152 L58 198 L24 198 Z"
            fill="url(#russianCoat)"
          />
          {/* Sharp Modern Lapels */}
          <path
            d="M58 142 L78 172 L84 144"
            stroke="#18181b"
            strokeWidth="1.5"
            strokeLinejoin="round"
            fill="#27272a"
          />
          <path
            d="M142 142 L122 172 L116 144"
            stroke="#18181b"
            strokeWidth="1.5"
            strokeLinejoin="round"
            fill="#27272a"
          />

          {/* DYNAMIC HEAD & SCULPTED SLAVIC FACE (ELEGANT, MATURE, AGE 30-38) */}
          <g className={getGestureAnimationClass()} style={{ transformOrigin: '100px 120px' }}>
            {/* Sculpted Slavic Oval Face with High Cheekbones & Refined Jaw */}
            <path
              d="M66 65 C66 37 134 37 134 65 C134 94 122 118 100 122 C78 118 66 94 66 65 Z"
              fill="url(#russianWomanSkin)"
            />

            {/* Slavic High Cheekbone Sculpting */}
            <path
              d="M68 83 C72 95 82 105 94 111 C84 107 74 97 70 87 Z"
              fill="#9e563a"
              opacity="0.25"
            />
            <path
              d="M132 83 C128 95 118 105 106 111 C116 107 126 97 130 87 Z"
              fill="#9e563a"
              opacity="0.25"
            />

            {/* Frost Champagne Cheekbone Highlighter */}
            <ellipse cx="76" cy="85" rx="9" ry="4" fill="url(#slavicHighlighter)" />
            <ellipse cx="124" cy="85" rx="9" ry="4" fill="url(#slavicHighlighter)" />

            {/* Soft Cool-Peach Blush */}
            <ellipse cx="76" cy="90" rx="8" ry="4" fill="#fb7185" opacity="0.22" />
            <ellipse cx="124" cy="90" rx="8" ry="4" fill="#fb7185" opacity="0.22" />

            {/* Tailored, Modern Slavic Arched Eyebrows (Microbladed Precision) */}
            <path
              d={
                isThinking
                  ? 'M72 69 Q82 63 93 67'
                  : isListening && userVolClamped > 0.04
                  ? 'M72 68.5 Q82 62.5 93 66.5'
                  : 'M72 69.5 Q82 64 93 68'
              }
              stroke="#4a3728"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={
                isThinking
                  ? 'M107 67 Q118 63 128 69'
                  : isListening && userVolClamped > 0.04
                  ? 'M107 66.5 Q118 62.5 128 68.5'
                  : 'M107 68 Q118 64 128 69.5'
              }
              stroke="#4a3728"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />

            {/* STRIKING BALTIC ICE-BLUE ALMOND EYES (Winged Liner, Crystal Catchlights) */}
            <g>
              {/* Left Eye */}
              <g className="animate-avatar-blink" style={{ transformOrigin: '82px 78px' }}>
                <path d="M70 78 Q82 71 94 78 Q82 85 70 78 Z" fill="#ffffff" />
                <ellipse cx="82" cy="78" rx="6.2" ry="5.9" fill="url(#balticIceBlueIris)" />
                <ellipse cx="82" cy="78" rx="3.5" ry="3.2" fill="url(#iceIrisShimmer)" />
                <circle cx="82" cy="78" r="2.7" fill="#082f49" />
                {/* Luminous Specular Catchlights */}
                <circle cx="80.5" cy="76.2" r="1.6" fill="#ffffff" />
                <circle cx="84" cy="79.5" r="0.8" fill="#ffffff" opacity="0.9" />
                {/* Modern Winged Cat-Eye Eyeliner */}
                <path d="M68 78 Q82 69 95 78" stroke="#09090b" strokeWidth="2.4" strokeLinecap="round" fill="none" />
                <path d="M94 78 L98 75.5" stroke="#09090b" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M71 78.5 Q82 84.5 93 78.5" stroke="#27272a" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.6" />
              </g>

              {/* Right Eye */}
              <g className="animate-avatar-blink" style={{ transformOrigin: '118px 78px' }}>
                <path d="M106 78 Q118 71 130 78 Q118 85 106 78 Z" fill="#ffffff" />
                <ellipse cx="118" cy="78" rx="6.2" ry="5.9" fill="url(#balticIceBlueIris)" />
                <ellipse cx="118" cy="78" rx="3.5" ry="3.2" fill="url(#iceIrisShimmer)" />
                <circle cx="118" cy="78" r="2.7" fill="#082f49" />
                <circle cx="116.5" cy="76.2" r="1.6" fill="#ffffff" />
                <circle cx="120" cy="79.5" r="0.8" fill="#ffffff" opacity="0.9" />
                <path d="M105 78 Q118 69 132 78" stroke="#09090b" strokeWidth="2.4" strokeLinecap="round" fill="none" />
                <path d="M131 78 L135 75.5" stroke="#09090b" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M107 78.5 Q118 84.5 129 78.5" stroke="#27272a" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.6" />
              </g>

              {/* Attentive Listening Eye Warmth */}
              {isListening && userVolClamped > 0.04 && (
                <g opacity="0.5">
                  <path d="M72 83 Q82 86 92 83" stroke="#e11d48" strokeWidth="0.9" strokeLinecap="round" fill="none" />
                  <path d="M108 83 Q118 86 128 83" stroke="#e11d48" strokeWidth="0.9" strokeLinecap="round" fill="none" />
                </g>
              )}
            </g>

            {/* Slender Slavic Contoured Nose */}
            <path d="M96 89 Q100 92 104 89" stroke="#9e563a" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            <circle cx="100" cy="87" r="1" fill="#ffffff" opacity="0.8" />

            {/* REAL-TIME DYNAMIC LIP-SYNC MOUTH (Velvet Rose-Mauve Lip, Cupid's Bow) */}
            <g id="modernFemaleMouth" style={{ transform: `scaleX(${visemeWidth})`, transformOrigin: '100px 103px' }}>
              {mouthHeight > 1.2 ? (
                /* Dynamic Open Speaking Mouth */
                <g id="modernFemaleOpenLipSync">
                  <path
                    d={`M 90 103 Q 100 ${101 - mouthHeight * 0.25} 110 103 Q 100 ${103 + mouthHeight * 1.5} 90 103 Z`}
                    fill="#3d060f"
                  />
                  {/* Pearly White Upper Teeth */}
                  <path
                    d={`M 92 103 Q 100 102 108 103 Q 100 ${103 + Math.min(3.4, mouthHeight * 0.52)} 92 103 Z`}
                    fill="#ffffff"
                    stroke="#fed7aa"
                    strokeWidth="0.3"
                  />
                  {/* Upper Lip with Sharp Cupid's Bow */}
                  <path
                    d="M 88 103 Q 94 100.5 98 101.5 Q 100 102.5 102 101.5 Q 106 100.5 112 103 Q 100 101.5 88 103 Z"
                    fill="url(#russianRoseMauveLips)"
                  />
                  {/* Lower Plump Lip */}
                  <path
                    d={`M 89 ${103 + mouthHeight} Q 100 ${106 + mouthHeight * 1.35} 111 ${103 + mouthHeight} Q 100 ${104 + mouthHeight * 0.9} 89 ${103 + mouthHeight} Z`}
                    fill="url(#russianRoseMauveLips)"
                  />
                </g>
              ) : (
                /* Poised, Elegant Modern Smile */
                <g id="russianRestingSmile">
                  <path
                    d="M 89 103 Q 94 101 98 102 Q 100 103 102 102 Q 106 101 111 103 Q 100 102 89 103 Z"
                    fill="url(#russianRoseMauveLips)"
                  />
                  <path
                    d="M 88 103 Q 100 106.5 112 103"
                    stroke="#700e26"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M 90 103.5 Q 100 108.5 110 103.5 Q 100 106.5 90 103.5 Z"
                    fill="url(#russianRoseMauveLips)"
                  />
                  {/* Gloss Specular Highlight */}
                  <ellipse cx="100" cy="105.8" rx="3.5" ry="1" fill="#ffe4e6" opacity="0.85" />
                  {/* Subtle Smile Dimple Corners */}
                  <path d="M 86 102.5 L 87 104" stroke="#9f1239" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
                  <path d="M 114 102.5 L 113 104" stroke="#9f1239" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
                </g>
              )}
            </g>

            {/* CHIC ASH-BLONDE HAIRSTYLE: Voluminous Layered Waves & Face-Framing Tendrils */}
            <path
              d="M66 64 C66 25 134 25 134 64 C124 45 112 39 100 41 C88 39 76 45 66 64 Z"
              fill="url(#russianAshBlonde)"
            />
            {/* Elegant Flowing Face-Framing Tendrils */}
            <path
              d="M66 64 C72 43 86 37 101 39 C118 37 128 43 134 64 C125 49 114 53 101 47 C88 43 76 49 66 64 Z"
              fill="url(#russianAshBlonde)"
            />
            {/* Platinum Hair Sheen Highlights */}
            <path d="M76 39 Q100 31 124 39" stroke="url(#russianBlondeGleam)" strokeWidth="3" strokeLinecap="round" fill="none" />

            {/* Modern Minimalist Platinum Huggie Earrings */}
            <g id="modernLeftHuggie" transform="translate(56, 81)">
              <circle cx="5" cy="5" r="4.2" fill="none" stroke="url(#sleekSilver)" strokeWidth="1.4" />
            </g>
            <g id="modernRightHuggie" transform="translate(133, 81)">
              <circle cx="5" cy="5" r="4.2" fill="none" stroke="url(#sleekSilver)" strokeWidth="1.4" />
            </g>
          </g>
        </svg>
      </div>
    );
  }

  // MODERN MALE AVATAR
  // Strong Slavic jawline, striking steel Nordic-blue eyes, textured swept-back ash-brown undercut,
  // 3-day designer stubble, sleek charcoal turtleneck under tailored dark midnight wool coat
  const mouthHeight = Math.max(0, visemeOpen * 12.5);

  return (
    <div
      className={`relative flex items-center justify-center animate-avatar-breathe select-none ${className}`}
      style={{
        transform: isSpeaking ? `scale(${1 + companionVolClamped * 0.035})` : 'scale(1)',
        transition: 'transform 80ms ease-out',
      }}
    >
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full drop-shadow-[0_16px_40px_rgba(2,132,199,0.3)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Fair-to-Neutral Alabaster Masculine Skin with Strong Bone Shadowing */}
          <linearGradient id="russianManSkin" x1="25%" y1="0%" x2="75%" y2="100%">
            <stop offset="0%" stopColor="#fff8f3" />
            <stop offset="20%" stopColor="#fde0cf" />
            <stop offset="65%" stopColor="#ebb194" />
            <stop offset="90%" stopColor="#cf8c69" />
            <stop offset="100%" stopColor="#ab6542" />
          </linearGradient>

          {/* Modern Textured Swept-Back Ash-Brown Hair */}
          <linearGradient id="russianAshBrownHair" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#453831" />
            <stop offset="40%" stopColor="#2c221d" />
            <stop offset="85%" stopColor="#18120f" />
            <stop offset="100%" stopColor="#080605" />
          </linearGradient>

          {/* Ash-Silver Sheen on Hair */}
          <linearGradient id="russianHairSheen" x1="0%" y1="0%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#735d51" stopOpacity="0" />
            <stop offset="50%" stopColor="#b59c8d" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#735d51" stopOpacity="0" />
          </linearGradient>

          {/* Striking Nordic Steel-Blue Eyes */}
          <radialGradient id="russianNordicBlueIris" cx="42%" cy="36%" r="65%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="30%" stopColor="#0284c7" />
            <stop offset="70%" stopColor="#0369a1" />
            <stop offset="100%" stopColor="#082f49" />
          </radialGradient>

          {/* Crisp 3-Day Designer Stubble (Sharp, Masculine Slavic Jaw) */}
          <linearGradient id="russianStubble" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2c221d" stopOpacity="0.28" />
            <stop offset="60%" stopColor="#18120f" stopOpacity="0.68" />
            <stop offset="100%" stopColor="#0a0706" stopOpacity="0.82" />
          </linearGradient>

          {/* Tailored Midnight Wool Coat & Charcoal Turtleneck */}
          <linearGradient id="russianCoatMan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="40%" stopColor="#0f172a" />
            <stop offset="85%" stopColor="#020617" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>

          {/* Confident Natural Warm Lip Color */}
          <linearGradient id="russianManLips" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e57373" />
            <stop offset="45%" stopColor="#c64c4c" />
            <stop offset="85%" stopColor="#8e2b2b" />
          </linearGradient>

          {/* Sleek Minimalist Platinum Chain */}
          <linearGradient id="sleekSilverMan" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="50%" stopColor="#f1f5f9" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>
        </defs>

        {/* Ambient Nordic Steel Rim */}
        <g opacity={rimGlow}>
          <circle cx="100" cy="98" r="82" fill="none" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 5" opacity="0.4" />
          <circle cx="30" cy="46" r="1.8" fill="#38bdf8" className="animate-pulse" />
          <circle cx="170" cy="46" r="1.8" fill="#60a5fa" className="animate-pulse" />
        </g>

        {/* Strong Masculine Neck */}
        <path d="M84 112 L116 112 L122 148 L78 148 Z" fill="url(#russianManSkin)" />
        <path d="M84 112 Q100 120 116 112 L118 119 Q100 127 82 119 Z" fill="#8e5132" opacity="0.38" />

        {/* Minimalist Platinum Chain */}
        <path d="M88 126 Q100 134 112 126" stroke="url(#sleekSilverMan)" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.85" />

        {/* Tailored Modern Midnight Wool Coat over Ribbed Charcoal Turtleneck */}
        {/* Inner Charcoal Turtleneck */}
        <path d="M78 140 L122 140 L132 198 L68 198 Z" fill="#0f172a" />
        {/* Tailored Coat Structure */}
        <path
          d="M42 146 C60 130 140 130 158 146 L178 198 L144 198 L122 152 L100 178 L78 152 L56 198 L22 198 Z"
          fill="url(#russianCoatMan)"
        />
        {/* Coat Lapels */}
        <path d="M76 138 Q100 146 124 138 L120 148 Q100 154 80 148 Z" fill="#020617" stroke="#1e293b" strokeWidth="0.8" />
        <path d="M100 150 L100 198" stroke="#334155" strokeWidth="1.2" opacity="0.8" />

        {/* DYNAMIC HEAD & CHISELED SLAVIC JAW (MATURE, SHARP, AGE 32–40) */}
        <g className={getGestureAnimationClass()} style={{ transformOrigin: '100px 120px' }}>
          {/* Chiseled Slavic Bone Structure: High Cheekbones & Square Jaw with Soft Chin */}
          <path
            d="M64 65 C64 35 136 35 136 65 C136 93 126 118 100 122 C74 118 64 93 64 65 Z"
            fill="url(#russianManSkin)"
          />

          {/* Sharp Jawline Stubble & 3-Day Designer Shadow */}
          <path
            d="M66 83 C66 107 78 121 100 121 C122 121 134 107 134 83 C134 93 130 111 118 116 C108 119 92 119 82 116 C70 111 66 93 66 83 Z"
            fill="url(#russianStubble)"
          />
          {/* Clean Trimmed Mustache Contour */}
          <path
            d="M86 98 Q94 96 99 97 Q100 98 101 97 Q106 96 114 98 Q108 102 101 100 Q99 99 97 100 Q92 102 86 98 Z"
            fill="#18120f"
            opacity="0.85"
          />

          {/* Defined Slavic Masculine Eyebrows */}
          <path
            d={
              isThinking
                ? 'M68 67 Q80 61 92 66'
                : isListening && userVolClamped > 0.04
                ? 'M68 66 Q80 60 92 65'
                : 'M68 67.5 Q80 62 92 67.5'
            }
            stroke="#211814"
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={
              isThinking
                ? 'M108 66 Q120 61 132 67'
                : isListening && userVolClamped > 0.04
                ? 'M108 65 Q120 60 132 66'
                : 'M108 67.5 Q120 62 132 67.5'
            }
            stroke="#211814"
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
          />

          {/* STRIKING NORDIC STEEL-BLUE EYES */}
          <g>
            {/* Left Eye */}
            <g className="animate-avatar-blink" style={{ transformOrigin: '80px 76px' }}>
              <path d="M69 76 Q80 70 92 76 Q80 82 69 76 Z" fill="#ffffff" />
              <ellipse cx="80" cy="76" rx="6.2" ry="5.7" fill="url(#russianNordicBlueIris)" />
              <circle cx="80" cy="76" r="2.7" fill="#082f49" />
              <circle cx="78.5" cy="74.2" r="1.5" fill="#ffffff" />
              <circle cx="82" cy="77.2" r="0.8" fill="#ffffff" opacity="0.9" />
              <path d="M68 76 Q80 69 93 76" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            </g>

            {/* Right Eye */}
            <g className="animate-avatar-blink" style={{ transformOrigin: '120px 76px' }}>
              <path d="M108 76 Q120 70 131 76 Q120 82 108 76 Z" fill="#ffffff" />
              <ellipse cx="120" cy="76" rx="6.2" ry="5.7" fill="url(#russianNordicBlueIris)" />
              <circle cx="120" cy="76" r="2.7" fill="#082f49" />
              <circle cx="118.5" cy="74.2" r="1.5" fill="#ffffff" />
              <circle cx="122" cy="77.2" r="0.8" fill="#ffffff" opacity="0.9" />
              <path d="M107 76 Q120 69 132 76" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            </g>

            {/* Confident Eye Smile Crinkles */}
            {isListening && (
              <g opacity="0.55">
                <path d="M67 75 L64 77" stroke="#0284c7" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M133 75 L136 77" stroke="#0284c7" strokeWidth="1.2" strokeLinecap="round" />
              </g>
            )}
          </g>

          {/* Sharp, Defined Straight Nose */}
          <path d="M96 89 Q100 92 104 89" stroke="#945334" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <circle cx="100" cy="87" r="1.1" fill="#ffffff" opacity="0.65" />

          {/* REAL-TIME DYNAMIC LIP-SYNC MOUTH (Charismatic Confident Smile) */}
          <g id="modernMaleMouth" style={{ transform: `scaleX(${visemeWidth})`, transformOrigin: '100px 103px' }}>
            {mouthHeight > 1.2 ? (
              <g id="modernMaleOpenMouth">
                <path
                  d={`M 90 103 Q 100 ${101 - mouthHeight * 0.25} 110 103 Q 100 ${103 + mouthHeight * 1.4} 90 103 Z`}
                  fill="#38060d"
                />
                <path
                  d={`M 92 103 Q 100 102 108 103 Q 100 ${103 + Math.min(3.4, mouthHeight * 0.5)} 92 103 Z`}
                  fill="#ffffff"
                  stroke="#cbd5e1"
                  strokeWidth="0.3"
                />
                <path
                  d="M 88 103 Q 94 100.5 98 101.5 Q 100 102 102 101.5 Q 106 100.5 112 103 Q 100 101.5 88 103 Z"
                  fill="url(#russianManLips)"
                />
                <path
                  d={`M 89 ${103 + mouthHeight} Q 100 ${106 + mouthHeight * 1.25} 111 ${103 + mouthHeight} Q 100 ${104 + mouthHeight * 0.85} 89 ${103 + mouthHeight} Z`}
                  fill="url(#russianManLips)"
                />
              </g>
            ) : (
              /* Charismatic Confident Calm Smile */
              <g id="russianDmitriRestingSmile">
                <path
                  d="M 88 103 Q 94 101 98 102 Q 100 102.5 102 102 Q 106 101 112 103 Q 100 102 88 103 Z"
                  fill="url(#russianManLips)"
                />
                <path d="M 88 103 Q 100 106.5 112 103" stroke="#681119" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                <path d="M 89 103.5 Q 100 108.2 111 103.5 Q 100 106.2 89 103.5 Z" fill="url(#russianManLips)" />
              </g>
            )}
          </g>

          {/* MODERN SWEPT-BACK UNDERCUT: Textured Ash-Brown with Silver Highlights */}
          {/* Clean Taper on Sides */}
          <path d="M64 63 C64 47 70 41 76 37 L76 65 Z" fill="#201713" opacity="0.9" />
          <path d="M136 63 C136 47 130 41 124 37 L124 65 Z" fill="#201713" opacity="0.9" />
          {/* Voluminous Swept-Back Textured Top */}
          <path
            d="M64 63 C64 25 136 25 136 63 C128 41 116 33 100 35 C84 33 72 41 64 63 Z"
            fill="url(#russianAshBrownHair)"
          />
          <path
            d="M66 59 C70 37 82 29 100 31 C118 29 130 37 134 59 C128 47 116 49 104 43 C92 39 78 47 66 59 Z"
            fill="url(#russianAshBrownHair)"
          />
          {/* Ash-Silver Sheen Highlights */}
          <path d="M74 37 Q100 27 126 37" stroke="url(#russianHairSheen)" strokeWidth="2.8" strokeLinecap="round" fill="none" />
        </g>
      </svg>
    </div>
  );
};
