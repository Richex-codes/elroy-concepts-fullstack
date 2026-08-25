import React, { useEffect, useRef, useState } from "react";
import { normalizeProductName } from "../utils/normalizeProductName.js";
import "../styles/SearchableSelect.css";

// Drop-in replacement for a long native <select>: shows a text input that
// filters the option list as you type, instead of forcing a scroll through
// hundreds of entries (the product catalog is well past the point a plain
// dropdown is usable, especially on a phone).
export default function SearchableSelect({
  options, // [{ value, label }]
  value,
  onChange,
  placeholder = "Search...",
  disabled = false,
}) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedOption = options.find((o) => o.value === value);

  // Keep the displayed text in sync with the externally-controlled value
  // (including options arriving asynchronously after `value` is already
  // set, e.g. a preselected product from a URL param) -- except while the
  // user has the dropdown open and is actively typing.
  useEffect(() => {
    if (!isOpen) {
      setSearchText(selectedOption ? selectedOption.label : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options, isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchText(selectedOption ? selectedOption.label : "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOption]);

  // Normalized (case/spacing/punctuation-insensitive) so "50 mm pipe" still
  // finds "50mm Pipe" -- same matching AddProduct's duplicate-name check
  // uses, just applied to searching the option list instead.
  const filtered =
    searchText.trim() === ""
      ? options
      : options.filter((o) => normalizeProductName(o.label).includes(normalizeProductName(searchText)));

  const handleSelect = (option) => {
    onChange(option.value);
    setSearchText(option.label);
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
      setIsOpen(true);
      return;
    }
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightedIndex]) handleSelect(filtered[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setSearchText(selectedOption ? selectedOption.label : "");
      inputRef.current?.blur();
    }
  };

  return (
    <div className="searchable-select" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        className="searchable-select-input"
        placeholder={placeholder}
        value={searchText}
        disabled={disabled}
        onFocus={() => {
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onChange={(e) => {
          setSearchText(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {isOpen && (
        <ul className="searchable-select-list">
          {filtered.length === 0 && <li className="searchable-select-empty">No matches</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              className={
                "searchable-select-option" +
                (i === highlightedIndex ? " highlighted" : "") +
                (o.value === value ? " selected" : "")
              }
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(o);
              }}
              onMouseEnter={() => setHighlightedIndex(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
