import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2, X, CheckCircle2, AlertCircle, Building } from 'lucide-react';
import { LocationSuggestionDto, LocationAutocompleteResponseDto } from '@vit-carpool/contracts';

export interface LocationAutocompleteProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string, location?: LocationSuggestionDto | null) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  selectedLocation?: LocationSuggestionDto | null;
  className?: string;
  inputClassName?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  id,
  name,
  value,
  onChange,
  placeholder = 'Search Chennai transit stop or landmark...',
  required = false,
  disabled = false,
  icon,
  selectedLocation,
  className = '',
  inputClassName = '',
  autoComplete = 'off',
  autoFocus = false,
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestionDto[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync internal inputValue if value prop changes externally
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  // Fetch suggestions from autocomplete API with abort capability
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);

    try {
      let token = localStorage.getItem('vit_auth_token');
      if (!token && import.meta.env.DEV) {
        try {
          const devRes = await fetch('/auth/dev-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'student@vitstudent.ac.in' }),
          });
          if (devRes.ok) {
            const devData = await devRes.json();
            token = devData.token;
            localStorage.setItem('vit_auth_token', devData.token);
            if (devData.user) {
              localStorage.setItem('vit_auth_user', JSON.stringify(devData.user));
            }
          }
        } catch {
          // Dev auto-auth failure; proceed without token
        }
      }

      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(
        `/locations/autocomplete?q=${encodeURIComponent(query.trim())}&limit=6`,
        {
          headers,
          signal: abortController.signal,
        },
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Institutional verification required for location search.');
        }
        if (response.status === 429) {
          throw new Error('Search rate limit reached. Please wait a moment.');
        }
        throw new Error(`Location search returned ${response.status}`);
      }

      const data: LocationAutocompleteResponseDto = await response.json();
      setSuggestions(data.suggestions || []);
      setIsOpen(true);
      setHighlightedIndex(-1);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Request cancelled due to newer keystroke
        return;
      }
      console.warn('Location autocomplete fetch failed:', err);
      setError('Unable to fetch live suggestions.');
      setSuggestions([]);
      setIsOpen(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setInputValue(nextVal);

    // Stale coordinate protection: typing any arbitrary text immediately resets coordinates
    onChange(nextVal, null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (nextVal.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(nextVal);
    }, 300);
  };

  const handleSelectSuggestion = (suggestion: LocationSuggestionDto) => {
    setInputValue(suggestion.name);
    onChange(suggestion.name, suggestion);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
    if (inputRef.current) {
      inputRef.current.blur();
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setInputValue('');
    onChange('', null);
    setSuggestions([]);
    setIsOpen(false);
    setError(null);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case 'Enter':
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const getCategoryBadge = (category?: string) => {
    switch (category) {
      case 'station':
        return <span className="location-badge station">Transit</span>;
      case 'campus':
        return <span className="location-badge campus">Campus</span>;
      case 'locality':
        return <span className="location-badge locality">Hub</span>;
      case 'landmark':
        return <span className="location-badge landmark">Point</span>;
      default:
        return null;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`location-autocomplete-root ${className}`}
      style={{ position: 'relative', width: '100%' }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
        {icon && (
          <div
            style={{
              position: 'absolute',
              left: '10px',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            {icon}
          </div>
        )}

        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (inputValue.trim().length >= 2) {
              if (suggestions.length > 0) {
                setIsOpen(true);
              } else {
                fetchSuggestions(inputValue);
              }
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className={inputClassName}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={id ? `${id}-suggestions-list` : undefined}
          aria-activedescendant={
            highlightedIndex >= 0 && id ? `${id}-opt-${highlightedIndex}` : undefined
          }
          style={{
            paddingLeft: icon ? '32px' : undefined,
            paddingRight: inputValue || loading ? '32px' : undefined,
            width: '100%',
          }}
        />

        {/* Clear & Loading Icons */}
        <div
          style={{
            position: 'absolute',
            right: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            zIndex: 2,
          }}
        >
          {loading && (
            <Loader2
              size={15}
              className="animate-spin"
              style={{ color: 'var(--color-brand-600)', animation: 'spin 1s linear infinite' }}
            />
          )}
          {!loading && inputValue && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear location input"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Structured Dropdown Menu */}
      {isOpen && (
        <div
          id={id ? `${id}-suggestions-list` : 'location-suggestions-list'}
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid var(--border-medium, #cbd5e1)',
            boxShadow:
              '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            zIndex: 9999,
            maxHeight: '280px',
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {loading && suggestions.length === 0 && (
            <div
              style={{
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.825rem',
                color: 'var(--text-muted, #64748b)',
              }}
            >
              <Loader2
                size={14}
                style={{ animation: 'spin 1s linear infinite', color: '#2563eb' }}
              />
              <span>Searching Chennai transit stops and landmarks...</span>
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.825rem',
                color: '#b91c1c',
                backgroundColor: '#fef2f2',
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && suggestions.length === 0 && (
            <div
              style={{
                padding: '14px',
                textAlign: 'center',
                fontSize: '0.825rem',
                color: 'var(--text-muted, #64748b)',
              }}
            >
              No matching Chennai locations found. You can still use custom text.
            </div>
          )}

          {suggestions.map((suggestion, index) => {
            const isHighlighted = highlightedIndex === index;
            const isSelected =
              selectedLocation?.name === suggestion.name ||
              (selectedLocation?.latitude === suggestion.latitude &&
                selectedLocation?.longitude === suggestion.longitude);

            return (
              <div
                key={suggestion.id}
                id={id ? `${id}-opt-${index}` : `opt-${index}`}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents input blur before selection
                  handleSelectSuggestion(suggestion);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                style={{
                  padding: '9px 12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  cursor: 'pointer',
                  backgroundColor: isHighlighted
                    ? '#eff6ff'
                    : isSelected
                    ? '#f0fdf4'
                    : 'transparent',
                  borderLeft: isHighlighted
                    ? '3px solid #2563eb'
                    : isSelected
                    ? '3px solid #16a34a'
                    : '3px solid transparent',
                  transition: 'background-color 0.1s ease',
                }}
              >
                <div
                  style={{
                    marginTop: '2px',
                    color: isHighlighted ? '#2563eb' : '#64748b',
                    flexShrink: 0,
                  }}
                >
                  {suggestion.category === 'campus' ? (
                    <Building size={16} />
                  ) : (
                    <MapPin size={16} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        color: isHighlighted ? '#1d4ed8' : '#0f172a',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {suggestion.name}
                    </span>
                    {getCategoryBadge(suggestion.category)}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: '#64748b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: '1px',
                    }}
                  >
                    {suggestion.address}
                  </div>
                </div>

                {isSelected && (
                  <CheckCircle2
                    size={16}
                    style={{ color: '#16a34a', flexShrink: 0, marginTop: '2px' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
