import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { PDFRenderer } from '../../core/pdf-renderer';

export function SearchBar({ onClose }) {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef(null);
  const pdfRendererRef = useRef(null);

  if (!pdfRendererRef.current) {
    pdfRendererRef.current = new PDFRenderer();
  }

  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(() => {
      executeSearch(val);
    }, 300);
  };

  const executeSearch = async (searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
      setSearchResults([]);
      setCurrentIndex(-1);
      return;
    }

    try {
      setIsSearching(true);
      const renderer = pdfRendererRef.current;
      if (state.pdfDocument && typeof state.pdfDocument.getPage === 'function') {
        renderer.setDocument(state.pdfDocument);
      } else if (state.pdfBytes) {
        await renderer.loadDocument(state.pdfBytes);
      }

      const results = await renderer.searchDocumentText(searchTerm);
      setSearchResults(results || []);
      if (results && results.length > 0) {
        setCurrentIndex(0);
        dispatch({ type: 'SET_CURRENT_PAGE', payload: results[0].pageNumber });
      } else {
        setCurrentIndex(-1);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const navigateMatch = (direction) => {
    if (!searchResults || searchResults.length === 0) return;
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = searchResults.length - 1;
    if (nextIndex >= searchResults.length) nextIndex = 0;

    setCurrentIndex(nextIndex);
    const targetMatch = searchResults[nextIndex];
    if (targetMatch) {
      dispatch({ type: 'SET_CURRENT_PAGE', payload: targetMatch.pageNumber });
    }
  };

  return (
    <div 
      className="glass-panel animate-fade-in"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-glass-heavy)',
        border: '1px solid var(--border-glass-bright)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <Search size={16} color="var(--accent-cyan)" />
      
      <input
        ref={inputRef}
        type="text"
        placeholder="Search text in PDF..."
        value={query}
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter') navigateMatch(1);
          if (e.key === 'Escape') onClose?.();
        }}
        style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-main)',
          fontSize: '0.85rem',
          width: '180px',
        }}
      />

      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: '60px', textAlign: 'center' }}>
        {isSearching ? (
          'Searching...'
        ) : searchResults && searchResults.length > 0 ? (
          `${currentIndex + 1} of ${searchResults.length}`
        ) : query ? (
          'No matches'
        ) : (
          ''
        )}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <button
          className="glass-btn"
          onClick={() => navigateMatch(-1)}
          disabled={!searchResults || searchResults.length === 0}
          style={{ padding: '4px 6px' }}
          title="Previous Match"
        >
          <ChevronUp size={14} />
        </button>
        <button
          className="glass-btn"
          onClick={() => navigateMatch(1)}
          disabled={!searchResults || searchResults.length === 0}
          style={{ padding: '4px 6px' }}
          title="Next Match"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      <button
        className="glass-btn"
        onClick={onClose}
        style={{ padding: '4px 6px', fontSize: '0.75rem' }}
        title="Close Search (Esc)"
      >
        <X size={14} />
      </button>
    </div>
  );
}
