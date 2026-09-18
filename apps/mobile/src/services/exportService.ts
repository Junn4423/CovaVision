import {Alert, Platform, Share} from 'react-native';
import RNFS from 'react-native-fs';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {DejaVuSansBase64} from './DejaVuSansBase64';

export type ExportType = 'csv' | 'excel' | 'pdf';
export type ExportRow = Record<string, string | number>;

export async function exportReportFile(
  rows: ExportRow[],
  filenameBase: string,
  type: ExportType,
  title: string = 'BÁO CÁO CHẤM CÔNG',
  columns?: {key: string; label: string}[],
): Promise<{filePath: string; fileName: string} | null> {
  if (!rows || rows.length === 0) {
    Alert.alert('Không có dữ liệu', 'Không có dữ liệu để xuất.');
    return null;
  }

  try {
    const cols = columns || Object.keys(rows[0]).map(key => ({key, label: key}));

    const fileExt = type === 'excel' ? 'xlsx' : type;
    const safeFilename = `${filenameBase.replace(/[/\\?%*:|"<>]/g, '_')}.${fileExt}`;
    const filePath =
      Platform.OS === 'android'
        ? `${RNFS.DownloadDirectoryPath}/${safeFilename}`
        : `${RNFS.DocumentDirectoryPath}/${safeFilename}`;

    if (type === 'csv') {
      const header = '\uFEFF' + cols.map(c => escapeCsv(c.label)).join(',');
      const body = rows
        .map(row => cols.map(c => escapeCsv(String(row[c.key] ?? ''))).join(','))
        .join('\n');
      const csv = `${header}\n${body}`;
      await RNFS.writeFile(filePath, csv, 'utf8');
    } else if (type === 'excel') {
      const titleLines = title.split('\n');
      const timeRow = [`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`];
      
      const worksheetData = [
        ...titleLines.map(line => [line.toUpperCase()]),
        timeRow,
        [],
        cols.map(c => c.label),
        ...rows.map(row => cols.map(c => row[c.key] ?? '')),
      ];
      const ws = XLSX.utils.aoa_to_sheet(worksheetData);
      
      // Auto-fit column widths & Highlight weekends
      const colWidths = cols.map((col, _colIndex) => {
        let maxLen = col.label.length;
        for (const row of rows) {
          const cellVal = String(row[col.key] || '');
          const segments = cellVal.split(' | ');
          const longestSegment = Math.max(...segments.map(s => s.length), col.label.length);
          if (longestSegment > maxLen) {
            maxLen = longestSegment;
          }
        }
        // STT should be narrow
        if (col.label === 'STT') return { wch: 5 };
        // Date should be stable
        if (col.label === 'Ngày') return { wch: 12 };
        
        return { wch: Math.min(maxLen + 3, 50) };
      });
      ws['!cols'] = colWidths;

      // Merge title cells
      if (!ws['!merges']) ws['!merges'] = [];
      titleLines.forEach((_, idx) => {
        ws['!merges']?.push({s: {r: idx, c: 0}, e: {r: idx, c: Math.max(cols.length - 1, 1)}});
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      const wbout = XLSX.write(wb, {type: 'base64', bookType: 'xlsx'});
      await RNFS.writeFile(filePath, wbout, 'base64');
    } else if (type === 'pdf') {
      const doc = new jsPDF('p', 'mm', 'a4'); // A4 Portrait (210mm x 297mm)

      // Add custom font for Vietnamese support
      doc.addFileToVFS('DejaVuSans.ttf', DejaVuSansBase64);
      doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
      doc.setFont('DejaVuSans');

      // Add multi-line title
      const titleLines = title.split('\n');
      doc.setFontSize(14);
      let currentY = 20;
      titleLines.forEach(line => {
        doc.text(line.toUpperCase(), doc.internal.pageSize.getWidth() / 2, currentY, { align: 'center' });
        currentY += 8;
      });

      doc.setFontSize(9);
      doc.text(`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`, 14, currentY + 5);
      currentY += 12;

      const tableHead = [cols.map(c => c.label)];
      const tableBody = rows.map(row => cols.map(c => String(row[c.key] ?? '')));

      autoTable(doc, {
        startY: currentY,
        head: tableHead,
        body: tableBody,
        theme: 'striped',
        styles: { font: 'DejaVuSans', fontStyle: 'normal', fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [31, 78, 120], halign: 'center', fontSize: 9 },
        alternateRowStyles: { fillColor: [248, 251, 255] },
        margin: { left: 14, right: 14 },
        columnStyles: {
          [cols.findIndex(c => c.label === 'STT')]: { cellWidth: 12, halign: 'center' },
          [cols.findIndex(c => c.label === 'Thứ')]: { cellWidth: 20, halign: 'center' },
          [cols.findIndex(c => c.label === 'Ngày')]: { cellWidth: 25, halign: 'center' },
          [cols.findIndex(c => c.label === 'Mã NV')]: { cellWidth: 22, halign: 'center' },
          [cols.findIndex(c => c.label === 'Tên')]: { cellWidth: 35 },
          [cols.findIndex(c => c.label === 'Giờ quét')]: { cellWidth: 'auto' }, // Let it fill the rest
        },
        didParseCell: function(data) {
          if (data.section === 'body') {
            const thuIdx = cols.findIndex(c => c.label === 'Thứ');
            if (thuIdx !== -1) {
              const thuStr = String((data.row.raw as any)[thuIdx] || '');
              if (thuStr.includes('Chủ nhật')) {
                 data.cell.styles.fillColor = [255, 235, 235]; // Light Red for Sunday
              } else if (thuStr.includes('Thứ 7')) {
                 data.cell.styles.fillColor = [235, 245, 255]; // Light Blue for Saturday
              }
            }
          }
        }
      });

      // Add signatures at the bottom
      const finalY = (doc as any).lastAutoTable?.finalY || 40;
      doc.setFontSize(11);
      doc.text('Người lập biểu', 40, finalY + 20);
      doc.text('(Ký, họ tên)', 45, finalY + 25);
      
      doc.text('Trưởng bộ phận', doc.internal.pageSize.getWidth() / 2 - 20, finalY + 20);
      doc.text('(Ký, họ tên)', doc.internal.pageSize.getWidth() / 2 - 15, finalY + 25);

      doc.text('Giám đốc', doc.internal.pageSize.getWidth() - 60, finalY + 20);
      doc.text('(Ký, họ tên)', doc.internal.pageSize.getWidth() - 55, finalY + 25);

      const pdfBase64 = doc.output('datauristring').split(',')[1];
      await RNFS.writeFile(filePath, pdfBase64, 'base64');
    }

    // Show success dialog
    Alert.alert('Tải file thành công', `Đã lưu file tại:\n${filePath}`, [
      {text: 'Đóng', style: 'cancel'},
      {
        text: 'Chia sẻ',
        onPress: () => {
          Share.share(
            {
              url: Platform.OS === 'ios' ? `file://${filePath}` : undefined,
              title: safeFilename,
              message: Platform.OS === 'android' ? `Tài liệu: ${safeFilename}` : safeFilename,
            },
            {
              dialogTitle: 'Chia sẻ báo cáo',
            }
          ).catch(() => {
            // Ignore cancel errors
          });
        },
      },
    ]);

    return {filePath, fileName: safeFilename};
  } catch (error) {
    Alert.alert(
      'Lỗi xuất file',
      error instanceof Error ? error.message : 'Không thể xuất báo cáo.',
    );
    return null;
  }
}

// Preserve existing function for backwards compatibility
export async function exportToCsvAndShare(
  rows: ExportRow[],
  filename: string,
  columns?: {key: string; label: string}[],
) {
  if (!rows || rows.length === 0) {
    Alert.alert('Không có dữ liệu', 'Không có dữ liệu để xuất.');
    return;
  }

  try {
    const cols = columns || Object.keys(rows[0]).map(key => ({key, label: key}));
    const header = '\uFEFF' + cols.map(c => escapeCsv(c.label)).join(',');
    const body = rows
      .map(row => cols.map(c => escapeCsv(String(row[c.key] ?? ''))).join(','))
      .join('\n');
    const csv = `${header}\n${body}`;

    const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '_');
    const filePath =
      Platform.OS === 'android'
        ? `${RNFS.DownloadDirectoryPath}/${safeFilename}`
        : `${RNFS.TemporaryDirectoryPath}/${safeFilename}`;

    await RNFS.writeFile(filePath, csv, 'utf8');

    await Share.share(
      {
        title: safeFilename,
        message: safeFilename,
        url: Platform.OS === 'ios' ? `file://${filePath}` : undefined,
      } as any,
      {
        subject: safeFilename,
        dialogTitle: 'Xuất báo cáo chấm công',
      },
    );
  } catch (error) {
    Alert.alert(
      'Lỗi xuất file',
      error instanceof Error ? error.message : 'Không thể xuất báo cáo.',
    );
  }
}

export async function shareTextReport(text: string, filename: string) {
  try {
    const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '_');
    const filePath =
      Platform.OS === 'android'
        ? `${RNFS.DownloadDirectoryPath}/${safeFilename}`
        : `${RNFS.TemporaryDirectoryPath}/${safeFilename}`;

    await RNFS.writeFile(filePath, text, 'utf8');

    await Share.share(
      {
        title: safeFilename,
        message: safeFilename,
        url: Platform.OS === 'ios' ? `file://${filePath}` : undefined,
      } as any,
      {
        subject: safeFilename,
        dialogTitle: 'Chia sẻ báo cáo',
      },
    );
  } catch (error) {
    Alert.alert('Lỗi', error instanceof Error ? error.message : 'Không thể chia sẻ.');
  }
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
