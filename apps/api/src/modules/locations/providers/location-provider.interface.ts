import { LocationSuggestionDto } from '@vit-carpool/contracts';

export interface ILocationProvider {
  search(query: string, limit: number): Promise<LocationSuggestionDto[]>;
}
