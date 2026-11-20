import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Image as ImageIcon, Trash2, X, RefreshCw, Check, AlertCircle, Loader2, ZoomIn, ZoomOut, RotateCcw, Crop, Move } from 'lucide-react';
import { Button } from '../common/Button';

interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasExistingAvatar: boolean;
  onUploadSuccess: (avatarUrl: string | null) => void;
  token: string | null;
}

const VIEWPORT_SIZE = 260;

export const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  isOpen,
  onClose,
  hasExistingAvatar,
  onUploadSuccess,
  token,
}) => {
  const [mode, setMode] = useState<'ACTIONS' | 'CAMERA' | 'CROP'>('ACTIONS');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);

  // Cropper states
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [rawImageElement, setRawImageElement] = useState<HTMLImageElement | null>(null);
  const [cropZoom, setCropZoom] = useState<number>(1);
  const [cropPan, setCropPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputFallbackRef = useRef<HTMLInputElement>(null);

  // Keep ref synced
  useEffect(() => {
    currentPanRef.current = cropPan;
  }, [cropPan]);

  // Stop camera media tracks safely
  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraReady(false);
  }, [stream]);

  // Clean up when modal closes or unmounts
  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setMode('ACTIONS');
      setRawImageSrc(null);
      setRawImageElement(null);
      setCropZoom(1);
      setCropPan({ x: 0, y: 0 });
      setError(null);
      setIsCameraReady(false);
    }
  }, [isOpen, stopStream]);

  // Start live camera stream
  const startCamera = async (selectedFacing: 'user' | 'environment' = facingMode) => {
    setError(null);
    setIsCameraReady(false);
    stopStream();

    if (!navigator?.mediaDevices?.getUserMedia) {
      cameraInputFallbackRef.current?.click();
      return;
    }

    try {
      let newStream: MediaStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: selectedFacing ? { ideal: selectedFacing } : undefined,
            width: { ideal: 1280, min: 480 },
            height: { ideal: 720, min: 480 },
          },
          audio: false,
        });
      } catch {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      setStream(newStream);
      setMode('CAMERA');
    } catch (err: any) {
      console.warn('getUserMedia error, falling back to capture input:', err);
      cameraInputFallbackRef.current?.click();
    }
  };

  // Helper to attach stream and configure Safari autoplay safely
  const attachStreamToVideo = useCallback((video: HTMLVideoElement | null, mediaStream: MediaStream | null) => {
    if (!video || !mediaStream) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('muted', 'true');
    video.setAttribute('autoplay', 'true');

    if (video.srcObject !== mediaStream) {
      video.srcObject = mediaStream;
    }

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('Live video play warning:', err);
      });
    }
  }, []);

  useEffect(() => {
    if (mode === 'CAMERA' && videoRef.current && stream) {
      attachStreamToVideo(videoRef.current, stream);
    }
  }, [mode, stream, attachStreamToVideo]);

  const bindVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node && stream) {
        attachStreamToVideo(node, stream);
      }
    },
    [stream, attachStreamToVideo],
  );

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Load raw image into Image object and open Crop mode
  const setupCropImage = (imageSrc: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setRawImageElement(img);
      setRawImageSrc(imageSrc);
      setCropZoom(1);
      setCropPan({ x: 0, y: 0 });
      setMode('CROP');
    };
    img.onerror = () => {
      setError('Could not load image for editing.');
    };
    img.src = imageSrc;
  };

  // Capture snapshot from video stream and open Cropper
  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    stopStream();
    setupCropImage(dataUrl);
  };

  // Handle file chosen from gallery or fallback capture
  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Only JPEG, PNG, or WebP images are supported.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      if (src) {
        setupCropImage(src);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Drag pan clamping helper
  const clampPan = (x: number, y: number, zoomLevel: number) => {
    if (!rawImageElement) return { x: 0, y: 0 };
    const imgW = rawImageElement.naturalWidth || rawImageElement.width;
    const imgH = rawImageElement.naturalHeight || rawImageElement.height;
    const baseScale = Math.max(VIEWPORT_SIZE / imgW, VIEWPORT_SIZE / imgH);
    const curW = imgW * baseScale * zoomLevel;
    const curH = imgH * baseScale * zoomLevel;
    const maxPanX = Math.max(0, (curW - VIEWPORT_SIZE) / 2);
    const maxPanY = Math.max(0, (curH - VIEWPORT_SIZE) / 2);

    return {
      x: Math.min(maxPanX, Math.max(-maxPanX, x)),
      y: Math.min(maxPanY, Math.max(-maxPanY, y)),
    };
  };

  // Drag Handlers for Mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - currentPanRef.current.x,
      y: e.clientY - currentPanRef.current.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const nextX = e.clientX - dragStartRef.current.x;
    const nextY = e.clientY - dragStartRef.current.y;
    setCropPan(clampPan(nextX, nextY, cropZoom));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Drag Handlers for Mobile Touch
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - currentPanRef.current.x,
        y: e.touches[0].clientY - currentPanRef.current.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const nextX = e.touches[0].clientX - dragStartRef.current.x;
    const nextY = e.touches[0].clientY - dragStartRef.current.y;
    setCropPan(clampPan(nextX, nextY, cropZoom));
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Apply crop and upload to server
  const handleApplyCropAndSave = async () => {
    if (!rawImageElement || !token) return;
    setLoading(true);
    setError(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('Canvas context could not be initialized.');
        setLoading(false);
        return;
      }

      const imgW = rawImageElement.naturalWidth || rawImageElement.width;
      const imgH = rawImageElement.naturalHeight || rawImageElement.height;
      const baseScale = Math.max(VIEWPORT_SIZE / imgW, VIEWPORT_SIZE / imgH);
      const totalScale = baseScale * cropZoom;

      const sx = ((imgW * totalScale) / 2 - VIEWPORT_SIZE / 2 - cropPan.x) / totalScale;
      const sy = ((imgH * totalScale) / 2 - VIEWPORT_SIZE / 2 - cropPan.y) / totalScale;
      const sWidth = VIEWPORT_SIZE / totalScale;
      const sHeight = VIEWPORT_SIZE / totalScale;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(rawImageElement, sx, sy, sWidth, sHeight, 0, 0, 512, 512);

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setError('Failed to export cropped photo.');
            setLoading(false);
            return;
          }

          const formData = new FormData();
          formData.append('file', blob, 'avatar.jpg');

          try {
            const res = await fetch('/api/users/me/avatar', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            });

            if (res.ok) {
              const data = await res.json();
              onUploadSuccess(data.avatarUrl);
              onClose();
            } else {
              const body = await res.json().catch(() => ({}));
              setError(body.message || 'Failed to upload photo.');
            }
          } catch {
            setError('Network error while uploading photo.');
          } finally {
            setLoading(false);
          }
        },
        'image/jpeg',
        0.88,
      );
    } catch (err: any) {
      setError(err?.message || 'Error processing crop.');
      setLoading(false);
    }
  };

  // Remove existing avatar
  const handleRemovePhoto = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/users/me/avatar', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        onUploadSuccess(null);
        onClose();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.message || 'Failed to remove photo.');
      }
    } catch {
      setError('Network error removing photo.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          stopStream();
          onClose();
        }
      }}
    >
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChosen}
      />
      <input
        ref={cameraInputFallbackRef}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: 'none' }}
        onChange={handleFileChosen}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'avatar-modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <style>{`
          @keyframes avatar-modal-pop {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {mode === 'CROP' && <Crop size={18} style={{ color: '#2563eb' }} />}
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
              {mode === 'CAMERA'
                ? 'Live Camera'
                : mode === 'CROP'
                ? 'Crop & Position Photo'
                : 'Profile Picture'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
            }}
            disabled={loading}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div
            style={{
              padding: '10px 16px',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Mode 1: Action Selection */}
        {mode === 'ACTIONS' && (
          <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              type="button"
              id="btn-take-live-photo"
              onClick={() => startCamera('user')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                width: '100%',
                padding: '14px 18px',
                borderRadius: '12px',
                border: '1.5px solid #2563eb',
                backgroundColor: '#eff6ff',
                color: '#1d4ed8',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Camera size={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>Take Photo (Camera)</span>
                <span style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: 500 }}>
                  Live capture with device camera
                </span>
              </div>
            </button>

            <button
              type="button"
              id="btn-choose-gallery"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                width: '100%',
                padding: '14px 18px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ImageIcon size={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>Choose from Gallery</span>
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                  Upload & crop photo
                </span>
              </div>
            </button>

            {hasExistingAvatar && (
              <button
                type="button"
                id="btn-remove-avatar"
                onClick={handleRemovePhoto}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  width: '100%',
                  padding: '12px 18px',
                  borderRadius: '12px',
                  border: '1px solid #fecaca',
                  backgroundColor: '#fff5f5',
                  color: '#dc2626',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginTop: '4px',
                }}
              >
                <Trash2 size={18} />
                <span>{loading ? 'Removing...' : 'Remove Photo'}</span>
              </button>
            )}
          </div>
        )}

        {/* Mode 2: Live Camera Viewfinder */}
        {mode === 'CAMERA' && (
          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              backgroundColor: '#0f172a',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: '260px',
                height: '260px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '4px solid #3b82f6',
                boxShadow: '0 0 24px rgba(59, 130, 246, 0.4)',
                backgroundColor: '#090d16',
                WebkitMaskImage: '-webkit-radial-gradient(white, black)',
                maskImage: 'radial-gradient(white, black)',
                isolation: 'isolate',
                transform: 'translateZ(0)',
                WebkitTransform: 'translateZ(0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {!isCameraReady && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    color: '#38bdf8',
                    backgroundColor: '#0f172a',
                    zIndex: 2,
                  }}
                >
                  <Loader2 size={32} className="animate-spin" />
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Starting camera...</span>
                </div>
              )}
              <video
                ref={bindVideoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  v.muted = true;
                  v.play().catch(() => {});
                }}
                onCanPlay={(e) => {
                  const v = e.currentTarget;
                  v.muted = true;
                  v.play().then(() => setIsCameraReady(true)).catch(() => {});
                }}
                onPlaying={() => setIsCameraReady(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '50%',
                  transform: facingMode === 'user' ? 'scaleX(-1) translateZ(0)' : 'translateZ(0)',
                  WebkitTransform: facingMode === 'user' ? 'scaleX(-1) translateZ(0)' : 'translateZ(0)',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={toggleFacingMode}
                title="Switch Camera"
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RefreshCw size={20} />
              </button>

              <button
                type="button"
                id="btn-shutter-capture"
                onClick={handleCaptureSnapshot}
                title="Capture Photo"
                style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  border: '5px solid #2563eb',
                  boxShadow: '0 0 16px rgba(37,99,235,0.6)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.1s ease',
                }}
              >
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: '#2563eb',
                  }}
                />
              </button>

              <button
                type="button"
                onClick={() => {
                  stopStream();
                  setMode('ACTIONS');
                }}
                title="Cancel"
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={20} />
              </button>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Position your face inside the circle
            </span>
          </div>
        )}

        {/* Mode 3: Interactive Photo Cropper */}
        {mode === 'CROP' && rawImageSrc && rawImageElement && (
          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              backgroundColor: '#0f172a',
              userSelect: 'none',
            }}
          >
            {/* Crop Viewport with Circular Mask */}
            <div
              style={{
                position: 'relative',
                width: `${VIEWPORT_SIZE}px`,
                height: `${VIEWPORT_SIZE}px`,
                overflow: 'hidden',
                borderRadius: '16px',
                backgroundColor: '#020617',
                cursor: isDragging ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Underlying Image */}
              {(() => {
                const imgW = rawImageElement.naturalWidth || rawImageElement.width;
                const imgH = rawImageElement.naturalHeight || rawImageElement.height;
                const baseScale = Math.max(VIEWPORT_SIZE / imgW, VIEWPORT_SIZE / imgH);
                const curW = imgW * baseScale * cropZoom;
                const curH = imgH * baseScale * cropZoom;
                const leftPos = (VIEWPORT_SIZE - curW) / 2 + cropPan.x;
                const topPos = (VIEWPORT_SIZE - curH) / 2 + cropPan.y;

                return (
                  <img
                    src={rawImageSrc}
                    alt="Crop Source"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: `${leftPos}px`,
                      top: `${topPos}px`,
                      width: `${curW}px`,
                      height: `${curH}px`,
                      maxWidth: 'none',
                      maxHeight: 'none',
                      pointerEvents: 'none',
                    }}
                  />
                );
              })()}

              {/* Circular Overlay Mask (Dark vignette outside circle) */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  border: '2px solid rgba(56, 189, 248, 0.9)',
                  boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72)',
                  pointerEvents: 'none',
                }}
              />

              {/* Move Indicator badge */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '3px 8px',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  color: '#e2e8f0',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  pointerEvents: 'none',
                }}
              >
                <Move size={12} /> Drag to adjust
              </div>
            </div>

            {/* Zoom Slider and Controls */}
            <div
              style={{
                width: '100%',
                maxWidth: `${VIEWPORT_SIZE + 40}px`,
                marginTop: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(1, cropZoom - 0.2);
                    setCropZoom(next);
                    setCropPan(clampPan(cropPan.x, cropPan.y, next));
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    color: '#94a3b8',
                    padding: '6px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Zoom Out"
                >
                  <ZoomOut size={16} />
                </button>

                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={cropZoom}
                  onChange={(e) => {
                    const next = parseFloat(e.target.value);
                    setCropZoom(next);
                    setCropPan(clampPan(cropPan.x, cropPan.y, next));
                  }}
                  style={{
                    flex: 1,
                    accentColor: '#3b82f6',
                    cursor: 'pointer',
                  }}
                />

                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(3, cropZoom + 0.2);
                    setCropZoom(next);
                    setCropPan(clampPan(cropPan.x, cropPan.y, next));
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    color: '#94a3b8',
                    padding: '6px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Zoom In"
                >
                  <ZoomIn size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCropZoom(1);
                    setCropPan({ x: 0, y: 0 });
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    color: '#94a3b8',
                    padding: '6px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Reset Position"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>

            {/* Bottom Actions */}
            <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '20px' }}>
              <Button
                variant="outline"
                size="md"
                style={{ flex: 1, color: '#f8fafc', borderColor: '#475569', backgroundColor: 'transparent' }}
                onClick={() => {
                  setRawImageSrc(null);
                  setRawImageElement(null);
                  setMode('ACTIONS');
                }}
                disabled={loading}
              >
                Back
              </Button>

              <Button
                variant="primary"
                size="md"
                id="btn-apply-crop-avatar"
                style={{ flex: 1 }}
                onClick={handleApplyCropAndSave}
                disabled={loading}
                leftIcon={loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              >
                {loading ? 'Saving...' : 'Set Photo'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
