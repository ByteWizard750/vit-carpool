import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Image as ImageIcon, Trash2, X, RefreshCw, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../common/Button';

interface AvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasExistingAvatar: boolean;
  onUploadSuccess: (avatarUrl: string | null) => void;
  token: string | null;
}

export const AvatarPickerModal: React.FC<AvatarPickerModalProps> = ({
  isOpen,
  onClose,
  hasExistingAvatar,
  onUploadSuccess,
  token,
}) => {
  const [mode, setMode] = useState<'ACTIONS' | 'CAMERA' | 'PREVIEW'>('ACTIONS');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputFallbackRef = useRef<HTMLInputElement>(null);

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
      setCapturedBlob(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setError(null);
      setIsCameraReady(false);
    }
  }, [isOpen, stopStream, previewUrl]);

  // Start live camera stream
  const startCamera = async (selectedFacing: 'user' | 'environment' = facingMode) => {
    setError(null);
    setIsCameraReady(false);
    stopStream();

    if (!navigator?.mediaDevices?.getUserMedia) {
      // Fallback for older browsers or restricted WebViews: use mobile native camera capture input
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
        // Fallback for desktop Safari/Chrome without strict facingMode support
        newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      setStream(newStream);
      setMode('CAMERA');
    } catch (err: any) {
      console.warn('getUserMedia error, falling back to capture input:', err);
      // If user denied camera or device unavailable, fallback gracefully
      cameraInputFallbackRef.current?.click();
    }
  };

  // Dedicated helper to attach stream and configure Safari autoplay safely
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

  // Ensure video element receives the stream once mounted in DOM
  useEffect(() => {
    if (mode === 'CAMERA' && videoRef.current && stream) {
      attachStreamToVideo(videoRef.current, stream);
    }
  }, [mode, stream, attachStreamToVideo]);

  // Callback ref to guarantee immediate stream binding on mount
  const bindVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node && stream) {
        attachStreamToVideo(node, stream);
      }
    },
    [stream, attachStreamToVideo],
  );

  // Flip between front/back cameras
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Capture snapshot from video stream onto canvas
  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    const size = Math.min(video.videoWidth, video.videoHeight) || 480;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Crop center square
    const startX = (video.videoWidth - size) / 2;
    const startY = (video.videoHeight - size) / 2;

    if (facingMode === 'user') {
      // Mirror horizontally for selfie view
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, startX, startY, size, size, 0, 0, size, size);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Failed to capture snapshot.');
          return;
        }
        stopStream();
        setCapturedBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setMode('PREVIEW');
      },
      'image/jpeg',
      0.88,
    );
  };

  // Handle file chosen from gallery or fallback capture
  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Only JPEG, PNG, or WebP images are supported.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError('Image must be under 8MB.');
      return;
    }

    // Resize and compress via canvas
    const img = new window.Image();
    const reader = new FileReader();

    reader.onload = (event) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              setError('Failed to process image.');
              return;
            }
            setCapturedBlob(blob);
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
            setMode('PREVIEW');
          },
          'image/jpeg',
          0.85,
        );
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Upload processed blob to /api/users/me/avatar
  const handleSaveAvatar = async () => {
    if (!capturedBlob || !token) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', capturedBlob, 'avatar.jpg');

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
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
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
          maxWidth: '420px',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'avatar-modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <style>{`
          @keyframes avatar-modal-pop {
            from { opacity: 0; transform: scale(0.95); }
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
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
            {mode === 'CAMERA'
              ? 'Live Camera'
              : mode === 'PREVIEW'
              ? 'Preview Photo'
              : 'Profile Picture'}
          </h3>
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
                  Upload JPEG, PNG or WebP
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

        {/* Mode 3: Captured Image Preview */}
        {mode === 'PREVIEW' && previewUrl && (
          <div
            style={{
              padding: '24px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <div
              style={{
                width: '180px',
                height: '180px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '4px solid #10b981',
                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.25)',
              }}
            >
              <img
                src={previewUrl}
                alt="Avatar Preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '8px' }}>
              <Button
                variant="outline"
                size="md"
                style={{ flex: 1 }}
                onClick={() => {
                  setCapturedBlob(null);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                  setMode('ACTIONS');
                }}
                disabled={loading}
              >
                Retake
              </Button>

              <Button
                variant="primary"
                size="md"
                id="btn-save-captured-avatar"
                style={{ flex: 1 }}
                onClick={handleSaveAvatar}
                disabled={loading}
                leftIcon={loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              >
                {loading ? 'Saving...' : 'Save Photo'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
