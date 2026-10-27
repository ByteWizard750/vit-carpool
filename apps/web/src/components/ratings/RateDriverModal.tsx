import React, { useState } from 'react';
import { Star, Loader2, AlertCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useAuth } from '../../features/auth/AuthContext';
import { DriverRatingResponseDto } from '@vit-carpool/contracts';

interface RateDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  driverName: string;
  rideOrigin: string;
  rideDestination: string;
  onRatingSubmitted: (rating: DriverRatingResponseDto) => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor — Had significant issues',
  2: 'Fair — Acceptable but room for improvement',
  3: 'Good — Standard safe commute',
  4: 'Very Good — Comfortable and punctual',
  5: 'Excellent — Outstanding, highly recommended!',
};

export const RateDriverModal: React.FC<RateDriverModalProps> = ({
  isOpen,
  onClose,
  bookingId,
  driverName,
  rideOrigin,
  rideDestination,
  onRatingSubmitted,
}) => {
  const { token } = useAuth();
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeStarCount = hoverRating || selectedRating;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || selectedRating < 1 || selectedRating > 5 || loading) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/ratings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          bookingId,
          rating: selectedRating,
          review: reviewText.trim() || undefined,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.message || `Failed to submit review (${res.status})`);
      }

      onRatingSubmitted(body);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to submit your rating. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rate Your Campus Ride"
      maxWidth="480px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Ride Context Header */}
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: '10px',
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
          }}
        >
          <div>
            <strong>Driver:</strong> {driverName}
          </div>
          <div>
            <strong>Trip:</strong> {rideOrigin} &rarr; {rideDestination}
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#991b1b',
              fontSize: '0.825rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            id="rating-error-banner"
          >
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Interactive Star Rating Selector */}
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: '10px',
            }}
          >
            How was your commute with {driverName}?
          </label>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '10px',
              marginBottom: '8px',
            }}
            id="star-rating-control"
          >
            {[1, 2, 3, 4, 5].map((star) => {
              const isFilled = star <= activeStarCount;

              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setSelectedRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '6px',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    transition: 'transform 0.1s ease',
                  }}
                  id={`btn-star-${star}`}
                >
                  <Star
                    size={32}
                    style={{
                      color: isFilled ? '#eab308' : '#cbd5e1',
                      fill: isFilled ? '#eab308' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  />
                </button>
              );
            })}
          </div>

          {/* Rating Description Label */}
          <div
            style={{
              minHeight: '20px',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: activeStarCount > 0 ? '#b45309' : 'var(--text-muted)',
            }}
            id="rating-selected-label"
          >
            {activeStarCount > 0
              ? RATING_LABELS[activeStarCount]
              : 'Tap a star to rate your driver'}
          </div>
        </div>

        {/* Optional Written Review */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label
              htmlFor="review-textarea"
              style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}
            >
              Feedback or Review (Optional)
            </label>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {reviewText.length}/500
            </span>
          </div>

          <textarea
            id="review-textarea"
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Share positive highlights (clean car, on-time, polite driving) to help prospective passengers..."
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              fontSize: '0.85rem',
              outline: 'none',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Modal Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={selectedRating < 1 || selectedRating > 5 || loading}
            leftIcon={loading ? <Loader2 size={15} className="animate-spin" /> : undefined}
            id="btn-submit-rating"
            style={{ backgroundColor: '#2563eb', borderColor: '#2563eb' }}
          >
            Submit Rating
          </Button>
        </div>
      </form>
    </Modal>
  );
};
