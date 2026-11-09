import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2, X, CheckCircle2, AlertCircle, Building } from 'lucide-react';
import { LocationSuggestionDto, LocationAutocompleteResponseDto } from '@vit-carpool/contracts';
import { searchFallbackLandmarks } from './chennai-landmarks.data';

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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Position dropdown intelligently within viewport to prevent overflow and maximize readability
  const updateDropdownPosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const isMobile = viewportWidth < 640;

      if (isMobile) {
        // On mobile, stretch cleanly across the container / viewport width
        setDropdownStyle({
          width: '100%',
          minWidth: '100%',
          maxWidth: `${viewportWidth - 32}px`,
          left: 0,
        });
      } else {
        // On desktop/tablet, provide a wide, generous dropdown (540px - 600px) so full location names and addresses are visible
        const desiredWidth = Math.min(580, viewportWidth - 32);
        const spaceOnRight = viewportWidth - rect.left - 16;

        if (spaceOnRight < desiredWidth) {
          // If expanding to the right would clip off-screen, shift left to stay nicely inside viewport
          const offset = Math.min(rect.left - 16, desiredWidth - rect.width);
          setDropdownStyle({
            width: `${desiredWidth}px`,
            left: `-${Math.max(0, offset)}px`,
          });
        } else {
          setDropdownStyle({
            width: `${desiredWidth}px`,
            left: 0,
          });
        }
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      window.addEventListener('resize', updateDropdownPosition);
      window.addEventListener('scroll', updateDropdownPosition, true);
      return () => {
        window.removeEventListener('resize', updateDropdownPosition);
        window.removeEventListener('scroll', updateDropdownPosition, true);
      };
    }
  }, [isOpen, updateDropdownPosition]);

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
          const devRes = await fetch('/api/auth/dev-login', {
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
        `/api/locations/autocomplete?q=${encodeURIComponent(query.trim())}&limit=6`,
        {
          headers,
          signal: abortController.signal,
        },
      );

      if (!response.ok) {
        // Fallback to client landmark catalog for unauthenticated or rate-limited sessions
        const fallbackResults = searchFallbackLandmarks(query.trim(), 6);
        if (fallbackResults.length > 0) {
          setSuggestions(fallbackResults);
          setIsOpen(true);
          setHighlightedIndex(-1);
          setError(null);
          return;
        }

        if (response.status === 401 || response.status === 403) {
          throw new Error('Institutional sign-in required for live location search.');
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
      const fallbackResults = searchFallbackLandmarks(query.trim(), 6);
      if (fallbackResults.length > 0) {
        setSuggestions(fallbackResults);
        setIsOpen(true);
        setHighlightedIndex(-1);
        setError(null);
      } else {
        console.warn('Location autocomplete fetch failed:', err);
        setError('Unable to fetch live suggestions.');
        setSuggestions([]);
        setIsOpen(true);
      }
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

  const handleBlur = () => {
    // Graceful landmark auto-matching if user typed without clicking dropdown
    if (!selectedLocation && inputValue.trim().length >= 3) {
      const trimmed = inputValue.trim().toLowerCase();
      const matched = searchFallbackLandmarks(trimmed, 1);
      if (matched.length > 0) {
        const top = matched[0];
        if (
          top.name.toLowerCase() === trimmed ||
          top.name.toLowerCase().includes(trimmed) ||
          trimmed.includes(top.name.toLowerCase())
        ) {
          onChange(inputValue, top);
        }
      }
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
    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: '0.675rem',
      fontWeight: 700,
      padding: '2px 7px',
      borderRadius: '9999px',
      textTransform: 'uppercase',
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
      lineHeight: 1.2,
      border: '1px solid transparent',
    };

    switch (category) {
      case 'station':
        return (
          <span style={{ ...baseStyle, backgroundColor: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
            Transit
          </span>
        );
      case 'campus':
        return (
          <span style={{ ...baseStyle, backgroundColor: '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}>
            Campus
          </span>
        );
      case 'locality':
        return (
          <span style={{ ...baseStyle, backgroundColor: '#faf5ff', color: '#7e22ce', borderColor: '#e9d5ff' }}>
            Hub
          </span>
        );
      case 'landmark':
        return (
          <span style={{ ...baseStyle, backgroundColor: '#fffbeb', color: '#b45309', borderColor: '#fde68a' }}>
            Point
          </span>
        );
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
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className={inputClassName || 'filter-autocomplete-input'}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={id ? `${id}-suggestions-list` : undefined}
          aria-activedescendant={
            highlightedIndex >= 0 && id ? `${id}-opt-${highlightedIndex}` : undefined
          }
          style={{
            width: '100%',
            height: inputClassName?.includes('search-segment-input') ? '28px' : '42px',
            paddingLeft: icon ? '34px' : inputClassName?.includes('search-segment-input') ? '0px' : '12px',
            paddingRight: inputValue || loading ? '34px' : '0px',
            paddingTop: inputClassName?.includes('search-segment-input') ? '0px' : '9px',
            paddingBottom: inputClassName?.includes('search-segment-input') ? '0px' : '9px',
            fontSize: '0.875rem',
            borderRadius: inputClassName?.includes('search-segment-input') ? '0px' : '8px',
            border: inputClassName?.includes('search-segment-input') ? 'none' : '1px solid var(--border-medium, #cbd5e1)',
            backgroundColor: inputClassName?.includes('search-segment-input') ? 'transparent' : disabled ? 'var(--bg-subtle, #f8fafc)' : '#ffffff',
            color: 'var(--text-primary, #0f172a)',
            outline: 'none',
            boxSizing: 'border-box',
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
            top: 'calc(100% + 6px)',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid var(--border-medium, #cbd5e1)',
            boxShadow:
              '0 20px 25px -5px rgba(0, 0, 0, 0.12), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            zIndex: 9999,
            maxHeight: '420px',
            overflowY: 'auto',
            padding: '6px 0',
            boxSizing: 'border-box',
            ...dropdownStyle,
          }}
        >
          {loading && suggestions.length === 0 && (
            <div
              style={{
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.875rem',
                color: 'var(--text-muted, #64748b)',
              }}
            >
              <Loader2
                size={16}
                style={{ animation: 'spin 1s linear infinite', color: '#2563eb' }}
              />
              <span>Searching Chennai transit stops and landmarks...</span>
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.875rem',
                color: '#b91c1c',
                backgroundColor: '#fef2f2',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && suggestions.length === 0 && (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                fontSize: '0.875rem',
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
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
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
                  transition: 'background-color 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: isHighlighted ? '#dbeafe' : '#f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isHighlighted ? '#1d4ed8' : '#475569',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {suggestion.category === 'campus' ? (
                    <Building size={20} />
                  ) : (
                    <MapPin size={20} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.975rem',
                        lineHeight: 1.35,
                        color: isHighlighted ? '#1d4ed8' : '#0f172a',
                        wordBreak: 'break-word',
                      }}
                    >
                      {suggestion.name}
                    </span>
                    <div style={{ flexShrink: 0, marginTop: '1px' }}>
                      {getCategoryBadge(suggestion.category)}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      lineHeight: 1.45,
                      color: '#475569',
                      marginTop: '4px',
                      wordBreak: 'break-word',
                    }}
                  >
                    {suggestion.address}
                  </div>
                </div>

                {isSelected && (
                  <CheckCircle2
                    size={18}
                    style={{ color: '#16a34a', flexShrink: 0, marginTop: '8px' }}
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
