interface ColumnResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

// Sits inside a <th> (which needs position: relative — see .full-table th in
// App.css) as a thin drag strip along its right edge.
export default function ColumnResizeHandle({ onMouseDown }: ColumnResizeHandleProps) {
  return (
    <span
      className="col-resize-handle"
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
    />
  );
}
