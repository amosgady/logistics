import { TableCell, TableSortLabel, TableCellProps } from '@mui/material';
import { SortConfig } from '../../hooks/useSortable';

interface SortableTableCellProps extends TableCellProps {
  label: string;
  sortKey: string;
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
}

export default function SortableTableCell({
  label,
  sortKey,
  sortConfig,
  onSort,
  ...cellProps
}: SortableTableCellProps) {
  const isActive = sortConfig?.key === sortKey;

  return (
    <TableCell {...cellProps}>
      <TableSortLabel
        active={isActive}
        direction={isActive ? sortConfig!.direction : 'asc'}
        onClick={() => onSort(sortKey)}
        sx={{ fontWeight: isActive ? 700 : undefined }}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}
