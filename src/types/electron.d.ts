export {};

declare global {
  interface Window {
    desktop?: {
      platform: string;
      isElectron: boolean;
      extractComplaintsFromImage: (imageDataUrl: string) => Promise<
        Array<{
          id: string;
          business: string;
          stationName: string;
          area: string;
          city: string;
          description: string;
          complaintType: string;
          loggedBy: string;
          contactPerson: string;
        }>
      >;
    };
  }
}
