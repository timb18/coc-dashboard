// Sortable tables — add data-sortable to <table>, data-sort="num|str" to <th>
// Each <td> can have data-val="rawValue" for numeric sort

export function initSortable() {
  document.querySelectorAll('table[data-sortable]').forEach(table => {
    let sortCol = -1, sortDir = 'asc';

    table.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const i = th.cellIndex;  // actual column index, not forEach index
        if (sortCol === i) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortCol = i;
          sortDir = th.dataset.defaultDir ?? 'asc';
        }

        // Update header indicators
        table.querySelectorAll('th[data-sort]').forEach(h => delete h.dataset.dir);
        th.dataset.dir = sortDir;

        const tbody = table.querySelector('tbody');
        const rows  = Array.from(tbody.querySelectorAll('tr[data-row]'));
        const type  = th.dataset.sort;

        rows.sort((a, b) => {
          const aCell = a.cells[i];
          const bCell = b.cells[i];
          const aRaw  = aCell?.dataset.val ?? aCell?.textContent.trim() ?? '';
          const bRaw  = bCell?.dataset.val ?? bCell?.textContent.trim() ?? '';

          let cmp;
          if (type === 'num') {
            cmp = (parseFloat(aRaw) || 0) - (parseFloat(bRaw) || 0);
          } else {
            cmp = aRaw.localeCompare(bRaw, 'de', { sensitivity: 'base' });
          }
          return sortDir === 'asc' ? cmp : -cmp;
        });

        rows.forEach(r => tbody.appendChild(r));
      });
    });
  });
}
