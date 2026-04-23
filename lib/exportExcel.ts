import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
const { documentDirectory, writeAsStringAsync } = FileSystem as any;
import * as Sharing from 'expo-sharing';

/**
 * Export data to an Excel file and trigger share/download on mobile.
 * @param rows - Array of plain objects (each key = column header).
 * @param sheetName - Name of the worksheet tab.
 * @param fileName - Download filename (without extension).
 */
export async function downloadExcel(rows: any[], sheetName: string = 'Sheet1', fileName: string = 'export') {
  if (!rows || rows.length === 0) return;

  try {
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Auto-size columns based on content
    const colWidths = Object.keys(rows[0]).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...rows.map((row) => String(row[key] ?? '').length)
      );
      return { wch: Math.min(maxLen + 2, 50) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Generate Excel file as base64
    const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

    // Define file path
    const fileUri = `${documentDirectory}${fileName}.xlsx`;

    // Write file
    await writeAsStringAsync(fileUri, base64, {
      encoding: 'base64',
    });

    // Share/Download file
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: `Download ${fileName}`,
        UTI: 'com.microsoft.excel.xlsx', // For iOS
      });
    } else {
      console.error('Sharing is not available on this platform');
    }
  } catch (error) {
    console.error('Error exporting Excel:', error);
  }
}
