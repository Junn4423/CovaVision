declare module 'react-native-sqlite-storage' {
  export interface SQLiteRowList {
    length: number;
    item(index: number): any;
  }

  export interface SQLiteResultSet {
    insertId?: number;
    rowsAffected: number;
    rows: SQLiteRowList;
  }

  export interface SQLiteDatabase {
    executeSql(statement: string, params?: any[]): Promise<[SQLiteResultSet]>;
    close(): Promise<void>;
  }

  export interface SQLiteOpenOptions {
    name: string;
    location?: string;
    createFromLocation?: number | string;
    readOnly?: boolean;
  }

  export interface SQLiteFactory {
    enablePromise(enabled: boolean): void;
    openDatabase(options: SQLiteOpenOptions): Promise<SQLiteDatabase>;
    deleteDatabase(options: SQLiteOpenOptions): Promise<void>;
  }

  const SQLite: SQLiteFactory;
  export default SQLite;
}
