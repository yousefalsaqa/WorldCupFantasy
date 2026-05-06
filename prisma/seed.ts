import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// ============================================
// 2026 FIFA WORLD CUP – ALL 48 QUALIFIED NATIONS
// (12 groups × 4 teams – official draw, December 2025)
// ============================================

const nations = [
  // Group A
  { name: 'Mexico',          code: 'MEX', group: 'A', kitColor1: '#006847', kitColor2: '#FFFFFF' },
  { name: 'South Africa',    code: 'RSA', group: 'A', kitColor1: '#FFB81C', kitColor2: '#007A4D' },
  { name: 'Korea Republic',  code: 'KOR', group: 'A', kitColor1: '#C60C30', kitColor2: '#FFFFFF' },
  { name: 'Czechia',         code: 'CZE', group: 'A', kitColor1: '#11457E', kitColor2: '#D7141A' }, // UEFA Playoff D winner

  // Group B
  { name: 'Canada',                code: 'CAN', group: 'B', kitColor1: '#FF0000', kitColor2: '#FFFFFF' },
  { name: 'Bosnia & Herzegovina',  code: 'BIH', group: 'B', kitColor1: '#002F6C', kitColor2: '#FECB00' }, // UEFA Playoff A winner
  { name: 'Qatar',                 code: 'QAT', group: 'B', kitColor1: '#8A1538', kitColor2: '#FFFFFF' },
  { name: 'Switzerland',           code: 'SUI', group: 'B', kitColor1: '#FF0000', kitColor2: '#FFFFFF' },

  // Group C
  { name: 'Brazil',     code: 'BRA', group: 'C', kitColor1: '#FFDF00', kitColor2: '#009739' },
  { name: 'Morocco',    code: 'MAR', group: 'C', kitColor1: '#C1272D', kitColor2: '#006233' },
  { name: 'Haiti',      code: 'HAI', group: 'C', kitColor1: '#00209F', kitColor2: '#D21034' },
  { name: 'Scotland',   code: 'SCO', group: 'C', kitColor1: '#0065BF', kitColor2: '#FFFFFF' },

  // Group D
  { name: 'USA',        code: 'USA', group: 'D', kitColor1: '#FFFFFF', kitColor2: '#002868' },
  { name: 'Paraguay',   code: 'PAR', group: 'D', kitColor1: '#DA121A', kitColor2: '#FFFFFF' },
  { name: 'Australia',  code: 'AUS', group: 'D', kitColor1: '#FFCD00', kitColor2: '#00843D' },
  { name: 'Türkiye',    code: 'TUR', group: 'D', kitColor1: '#E30A17', kitColor2: '#FFFFFF' }, // UEFA Playoff C winner

  // Group E
  { name: 'Germany',      code: 'GER', group: 'E', kitColor1: '#FFFFFF', kitColor2: '#000000' },
  { name: 'Curaçao',      code: 'CUW', group: 'E', kitColor1: '#002B7F', kitColor2: '#F9E814' },
  { name: "Côte d'Ivoire", code: 'CIV', group: 'E', kitColor1: '#FF8200', kitColor2: '#009A44' },
  { name: 'Ecuador',      code: 'ECU', group: 'E', kitColor1: '#FFD100', kitColor2: '#034EA2' },

  // Group F
  { name: 'Netherlands', code: 'NED', group: 'F', kitColor1: '#FF6600', kitColor2: '#FFFFFF' },
  { name: 'Japan',       code: 'JPN', group: 'F', kitColor1: '#000080', kitColor2: '#FFFFFF' },
  { name: 'Sweden',      code: 'SWE', group: 'F', kitColor1: '#FECC02', kitColor2: '#006AA7' }, // UEFA Playoff B winner
  { name: 'Tunisia',     code: 'TUN', group: 'F', kitColor1: '#E70013', kitColor2: '#FFFFFF' },

  // Group G
  { name: 'Belgium',     code: 'BEL', group: 'G', kitColor1: '#ED2939', kitColor2: '#000000' },
  { name: 'Egypt',       code: 'EGY', group: 'G', kitColor1: '#C8102E', kitColor2: '#FFFFFF' },
  { name: 'Iran',        code: 'IRN', group: 'G', kitColor1: '#FFFFFF', kitColor2: '#DA0000' },
  { name: 'New Zealand', code: 'NZL', group: 'G', kitColor1: '#FFFFFF', kitColor2: '#000000' },

  // Group H
  { name: 'Spain',         code: 'ESP', group: 'H', kitColor1: '#AA151B', kitColor2: '#F1BF00' },
  { name: 'Cabo Verde',    code: 'CPV', group: 'H', kitColor1: '#003893', kitColor2: '#F7D618' },
  { name: 'Saudi Arabia',  code: 'KSA', group: 'H', kitColor1: '#006C35', kitColor2: '#FFFFFF' },
  { name: 'Uruguay',       code: 'URU', group: 'H', kitColor1: '#5CBFEB', kitColor2: '#FFFFFF' },

  // Group I
  { name: 'France',  code: 'FRA', group: 'I', kitColor1: '#002395', kitColor2: '#FFFFFF' },
  { name: 'Senegal', code: 'SEN', group: 'I', kitColor1: '#FFFFFF', kitColor2: '#00853F' },
  { name: 'Iraq',    code: 'IRQ', group: 'I', kitColor1: '#FFFFFF', kitColor2: '#CE1126' }, // FIFA Inter-Confederation Playoff 2 winner
  { name: 'Norway',  code: 'NOR', group: 'I', kitColor1: '#BA0C2F', kitColor2: '#FFFFFF' },

  // Group J
  { name: 'Argentina', code: 'ARG', group: 'J', kitColor1: '#74ACDF', kitColor2: '#FFFFFF' },
  { name: 'Algeria',   code: 'ALG', group: 'J', kitColor1: '#006233', kitColor2: '#FFFFFF' },
  { name: 'Austria',   code: 'AUT', group: 'J', kitColor1: '#ED2939', kitColor2: '#FFFFFF' },
  { name: 'Jordan',    code: 'JOR', group: 'J', kitColor1: '#FFFFFF', kitColor2: '#CE1126' },

  // Group K
  { name: 'Portugal',   code: 'POR', group: 'K', kitColor1: '#FF0000', kitColor2: '#006600' },
  { name: 'DR Congo',   code: 'COD', group: 'K', kitColor1: '#007FFF', kitColor2: '#F7D618' }, // FIFA Inter-Confederation Playoff 1 winner
  { name: 'Uzbekistan', code: 'UZB', group: 'K', kitColor1: '#FFFFFF', kitColor2: '#1EB53A' },
  { name: 'Colombia',   code: 'COL', group: 'K', kitColor1: '#FCD116', kitColor2: '#003087' },

  // Group L
  { name: 'England', code: 'ENG', group: 'L', kitColor1: '#FFFFFF', kitColor2: '#002366' },
  { name: 'Croatia', code: 'CRO', group: 'L', kitColor1: '#FF0000', kitColor2: '#FFFFFF' },
  { name: 'Ghana',   code: 'GHA', group: 'L', kitColor1: '#FFFFFF', kitColor2: '#006B3F' },
  { name: 'Panama',  code: 'PAN', group: 'L', kitColor1: '#DA121A', kitColor2: '#FFFFFF' },
];

// ============================================
// TOURNAMENT STAGES
// ============================================

const stages = [
  { stageId: 'GR1', name: 'Group Stage - Round 1', order: 1 },
  { stageId: 'GR2', name: 'Group Stage - Round 2', order: 2 },
  { stageId: 'GR3', name: 'Group Stage - Round 3', order: 3 },
  { stageId: 'R32', name: 'Round of 32', order: 4 },
  { stageId: 'R16', name: 'Round of 16', order: 5 },
  { stageId: 'QF', name: 'Quarter Finals', order: 6 },
  { stageId: 'SF', name: 'Semi Finals', order: 7 },
  { stageId: '3RD', name: 'Third Place Play-off', order: 8 },
  { stageId: 'F', name: 'Final', order: 9 },
];

// ============================================
// REAL WORLD CUP 2026 PLAYERS
// ============================================

const players = [
  // ========== GOALKEEPERS ==========
  { firstName: 'Alisson', lastName: 'Becker', displayName: 'Alisson', nationCode: 'BRA', position: 'GK', price: 6.0, number: 1 },
  { firstName: 'Thibaut', lastName: 'Courtois', displayName: 'Courtois', nationCode: 'BEL', position: 'GK', price: 5.5, number: 1 },
  { firstName: 'Manuel', lastName: 'Neuer', displayName: 'Neuer', nationCode: 'GER', position: 'GK', price: 5.5, number: 1 },
  { firstName: 'Jordan', lastName: 'Pickford', displayName: 'Pickford', nationCode: 'ENG', position: 'GK', price: 5.0, number: 1 },
  { firstName: 'Mike', lastName: 'Maignan', displayName: 'Maignan', nationCode: 'FRA', position: 'GK', price: 5.5, number: 16 },
  { firstName: 'Unai', lastName: 'Simón', displayName: 'U. Simón', nationCode: 'ESP', position: 'GK', price: 5.0, number: 23 },
  { firstName: 'Yassine', lastName: 'Bounou', displayName: 'Bounou', nationCode: 'MAR', position: 'GK', price: 5.0, number: 1 },
  { firstName: 'Emiliano', lastName: 'Martínez', displayName: 'E. Martínez', nationCode: 'ARG', position: 'GK', price: 5.5, number: 23 },
  { firstName: 'Diogo', lastName: 'Costa', displayName: 'D. Costa', nationCode: 'POR', position: 'GK', price: 4.5, number: 22 },
  { firstName: 'Dominik', lastName: 'Livaković', displayName: 'Livaković', nationCode: 'CRO', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'Sergio', lastName: 'Rochet', displayName: 'Rochet', nationCode: 'URU', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'Matt', lastName: 'Turner', displayName: 'Turner', nationCode: 'USA', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'Kim', lastName: 'Seung-gyu', displayName: 'Kim S-G', nationCode: 'KOR', position: 'GK', price: 4.0, number: 1 },
  { firstName: 'Guillermo', lastName: 'Ochoa', displayName: 'Ochoa', nationCode: 'MEX', position: 'GK', price: 4.5, number: 13 },
  { firstName: 'Mathew', lastName: 'Ryan', displayName: 'Mat Ryan', nationCode: 'AUS', position: 'GK', price: 4.0, number: 1 },
  { firstName: 'Mohamed', lastName: 'El-Shenawy', displayName: 'El-Shenawy', nationCode: 'EGY', position: 'GK', price: 4.0, number: 1 },
  
  // ========== DEFENDERS ==========
  { firstName: 'Virgil', lastName: 'van Dijk', displayName: 'Van Dijk', nationCode: 'NED', position: 'DEF', price: 7.0, number: 4 },
  { firstName: 'Trent', lastName: 'Alexander-Arnold', displayName: 'Alexander-Arnold', nationCode: 'ENG', position: 'DEF', price: 7.5, number: 66 },
  { firstName: 'Achraf', lastName: 'Hakimi', displayName: 'Hakimi', nationCode: 'MAR', position: 'DEF', price: 6.5, number: 2 },
  { firstName: 'Theo', lastName: 'Hernández', displayName: 'Theo Hernández', nationCode: 'FRA', position: 'DEF', price: 6.5, number: 22 },
  { firstName: 'João', lastName: 'Cancelo', displayName: 'Cancelo', nationCode: 'POR', position: 'DEF', price: 6.5, number: 20 },
  { firstName: 'Rúben', lastName: 'Dias', displayName: 'Rúben Dias', nationCode: 'POR', position: 'DEF', price: 6.0, number: 4 },
  { firstName: 'Marquinhos', lastName: '', displayName: 'Marquinhos', nationCode: 'BRA', position: 'DEF', price: 6.0, number: 4 },
  { firstName: 'William', lastName: 'Saliba', displayName: 'Saliba', nationCode: 'FRA', position: 'DEF', price: 6.0, number: 17 },
  { firstName: 'Antonio', lastName: 'Rüdiger', displayName: 'Rüdiger', nationCode: 'GER', position: 'DEF', price: 5.5, number: 22 },
  { firstName: 'Cristian', lastName: 'Romero', displayName: 'C. Romero', nationCode: 'ARG', position: 'DEF', price: 5.5, number: 13 },
  { firstName: 'Kyle', lastName: 'Walker', displayName: 'Walker', nationCode: 'ENG', position: 'DEF', price: 5.5, number: 2 },
  { firstName: 'Jules', lastName: 'Koundé', displayName: 'Koundé', nationCode: 'FRA', position: 'DEF', price: 5.5, number: 5 },
  { firstName: 'Dani', lastName: 'Carvajal', displayName: 'Carvajal', nationCode: 'ESP', position: 'DEF', price: 5.5, number: 2 },
  { firstName: 'Ronald', lastName: 'Araújo', displayName: 'Araújo', nationCode: 'URU', position: 'DEF', price: 5.5, number: 4 },
  { firstName: 'Joško', lastName: 'Gvardiol', displayName: 'Gvardiol', nationCode: 'CRO', position: 'DEF', price: 5.5, number: 24 },
  { firstName: 'Nayef', lastName: 'Aguerd', displayName: 'Aguerd', nationCode: 'MAR', position: 'DEF', price: 5.0, number: 5 },
  { firstName: 'John', lastName: 'Stones', displayName: 'Stones', nationCode: 'ENG', position: 'DEF', price: 5.0, number: 5 },
  { firstName: 'Lisandro', lastName: 'Martínez', displayName: 'L. Martínez', nationCode: 'ARG', position: 'DEF', price: 5.0, number: 25 },
  { firstName: 'Antonee', lastName: 'Robinson', displayName: 'A. Robinson', nationCode: 'USA', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'Kim', lastName: 'Min-jae', displayName: 'Kim Min-jae', nationCode: 'KOR', position: 'DEF', price: 5.0, number: 3 },
  { firstName: 'Jonathan', lastName: 'Tah', displayName: 'Tah', nationCode: 'GER', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'Alphonso', lastName: 'Davies', displayName: 'A. Davies', nationCode: 'CAN', position: 'DEF', price: 5.5, number: 19 },
  { firstName: 'Sergiño', lastName: 'Dest', displayName: 'Dest', nationCode: 'USA', position: 'DEF', price: 4.5, number: 2 },
  { firstName: 'Andrew', lastName: 'Robertson', displayName: 'Robertson', nationCode: 'SCO', position: 'DEF', price: 5.0, number: 3 },
  
  // ========== MIDFIELDERS ==========
  { firstName: 'Jude', lastName: 'Bellingham', displayName: 'Bellingham', nationCode: 'ENG', position: 'MID', price: 10.0, number: 10 },
  { firstName: 'Kevin', lastName: 'De Bruyne', displayName: 'De Bruyne', nationCode: 'BEL', position: 'MID', price: 10.5, number: 7 },
  { firstName: 'Bruno', lastName: 'Fernandes', displayName: 'Bruno F.', nationCode: 'POR', position: 'MID', price: 9.0, number: 8 },
  { firstName: 'Florian', lastName: 'Wirtz', displayName: 'Wirtz', nationCode: 'GER', position: 'MID', price: 9.0, number: 17 },
  { firstName: 'Jamal', lastName: 'Musiala', displayName: 'Musiala', nationCode: 'GER', position: 'MID', price: 9.0, number: 10 },
  { firstName: 'Pedri', lastName: 'González', displayName: 'Pedri', nationCode: 'ESP', position: 'MID', price: 8.5, number: 8 },
  { firstName: 'Bukayo', lastName: 'Saka', displayName: 'Saka', nationCode: 'ENG', position: 'MID', price: 9.0, number: 7 },
  { firstName: 'Phil', lastName: 'Foden', displayName: 'Foden', nationCode: 'ENG', position: 'MID', price: 8.5, number: 47 },
  { firstName: 'Federico', lastName: 'Valverde', displayName: 'Valverde', nationCode: 'URU', position: 'MID', price: 8.0, number: 15 },
  { firstName: 'Luka', lastName: 'Modrić', displayName: 'Modrić', nationCode: 'CRO', position: 'MID', price: 7.5, number: 10 },
  { firstName: 'Gavi', lastName: 'Páez', displayName: 'Gavi', nationCode: 'ESP', position: 'MID', price: 7.5, number: 6 },
  { firstName: 'Eduardo', lastName: 'Camavinga', displayName: 'Camavinga', nationCode: 'FRA', position: 'MID', price: 7.0, number: 12 },
  { firstName: 'Aurélien', lastName: 'Tchouaméni', displayName: 'Tchouaméni', nationCode: 'FRA', position: 'MID', price: 7.0, number: 8 },
  { firstName: 'Declan', lastName: 'Rice', displayName: 'Rice', nationCode: 'ENG', position: 'MID', price: 7.0, number: 4 },
  { firstName: 'Thomas', lastName: 'Müller', displayName: 'Müller', nationCode: 'GER', position: 'MID', price: 7.0, number: 13 },
  { firstName: 'Enzo', lastName: 'Fernández', displayName: 'Enzo', nationCode: 'ARG', position: 'MID', price: 7.5, number: 24 },
  { firstName: 'Martin', lastName: 'Ødegaard', displayName: 'Ødegaard', nationCode: 'NOR', position: 'MID', price: 8.0, number: 8 },
  { firstName: 'Weston', lastName: 'McKennie', displayName: 'McKennie', nationCode: 'USA', position: 'MID', price: 6.0, number: 8 },
  { firstName: 'Tyler', lastName: 'Adams', displayName: 'T. Adams', nationCode: 'USA', position: 'MID', price: 5.5, number: 4 },
  { firstName: 'Sofyan', lastName: 'Amrabat', displayName: 'Amrabat', nationCode: 'MAR', position: 'MID', price: 5.5, number: 4 },
  { firstName: 'Alexis', lastName: 'Mac Allister', displayName: 'Mac Allister', nationCode: 'ARG', position: 'MID', price: 7.0, number: 20 },
  { firstName: 'Scott', lastName: 'McTominay', displayName: 'McTominay', nationCode: 'SCO', position: 'MID', price: 5.5, number: 4 },
  { firstName: 'Lee', lastName: 'Kang-in', displayName: 'Lee Kang-in', nationCode: 'KOR', position: 'MID', price: 6.5, number: 10 },
  { firstName: 'Takefusa', lastName: 'Kubo', displayName: 'Kubo', nationCode: 'JPN', position: 'MID', price: 6.5, number: 11 },
  
  // ========== FORWARDS ==========
  { firstName: 'Kylian', lastName: 'Mbappé', displayName: 'Mbappé', nationCode: 'FRA', position: 'FWD', price: 14.0, number: 10 },
  { firstName: 'Erling', lastName: 'Haaland', displayName: 'Haaland', nationCode: 'NOR', position: 'FWD', price: 14.5, number: 9 },
  { firstName: 'Lionel', lastName: 'Messi', displayName: 'Messi', nationCode: 'ARG', position: 'FWD', price: 12.0, number: 10 },
  { firstName: 'Vinícius', lastName: 'Júnior', displayName: 'Vinícius Jr', nationCode: 'BRA', position: 'FWD', price: 11.5, number: 7 },
  { firstName: 'Harry', lastName: 'Kane', displayName: 'Kane', nationCode: 'ENG', position: 'FWD', price: 11.5, number: 9 },
  { firstName: 'Mohamed', lastName: 'Salah', displayName: 'Salah', nationCode: 'EGY', position: 'FWD', price: 12.5, number: 10 },
  { firstName: 'Lautaro', lastName: 'Martínez', displayName: 'L. Martínez', nationCode: 'ARG', position: 'FWD', price: 10.0, number: 22 },
  { firstName: 'Rodrygo', lastName: 'Goes', displayName: 'Rodrygo', nationCode: 'BRA', position: 'FWD', price: 9.0, number: 11 },
  { firstName: 'Heung-min', lastName: 'Son', displayName: 'Son', nationCode: 'KOR', position: 'FWD', price: 9.5, number: 7 },
  { firstName: 'Julián', lastName: 'Álvarez', displayName: 'J. Álvarez', nationCode: 'ARG', position: 'FWD', price: 8.5, number: 9 },
  { firstName: 'Rafael', lastName: 'Leão', displayName: 'R. Leão', nationCode: 'POR', position: 'FWD', price: 8.5, number: 17 },
  { firstName: 'Marcus', lastName: 'Rashford', displayName: 'Rashford', nationCode: 'ENG', position: 'FWD', price: 8.0, number: 11 },
  { firstName: 'Cody', lastName: 'Gakpo', displayName: 'Gakpo', nationCode: 'NED', position: 'FWD', price: 8.0, number: 18 },
  { firstName: 'Darwin', lastName: 'Núñez', displayName: 'Darwin', nationCode: 'URU', position: 'FWD', price: 8.5, number: 11 },
  { firstName: 'Kai', lastName: 'Havertz', displayName: 'Havertz', nationCode: 'GER', position: 'FWD', price: 7.5, number: 7 },
  { firstName: 'Álvaro', lastName: 'Morata', displayName: 'Morata', nationCode: 'ESP', position: 'FWD', price: 7.0, number: 7 },
  { firstName: 'Christian', lastName: 'Pulisic', displayName: 'Pulisic', nationCode: 'USA', position: 'FWD', price: 7.5, number: 10 },
  { firstName: 'Richarlison', lastName: '', displayName: 'Richarlison', nationCode: 'BRA', position: 'FWD', price: 7.5, number: 9 },
  { firstName: 'Youssef', lastName: 'En-Nesyri', displayName: 'En-Nesyri', nationCode: 'MAR', position: 'FWD', price: 6.5, number: 19 },
  { firstName: 'Jonathan', lastName: 'David', displayName: 'J. David', nationCode: 'CAN', position: 'FWD', price: 7.0, number: 20 },
  { firstName: 'Che', lastName: 'Adams', displayName: 'C. Adams', nationCode: 'SCO', position: 'FWD', price: 5.5, number: 10 },
  { firstName: 'Duván', lastName: 'Zapata', displayName: 'Zapata', nationCode: 'COL', position: 'FWD', price: 6.5, number: 9 },
  
  // ========== ADDITIONAL PLAYERS (Neymar + ~50 more) ==========
  // Neymar (Brazil)
  { firstName: 'Neymar', lastName: 'da Silva Santos Júnior', displayName: 'Neymar', nationCode: 'BRA', position: 'FWD', price: 11.0, number: 10 },
  
  // More Goalkeepers
  { firstName: 'André', lastName: 'Onana', displayName: 'Onana', nationCode: 'CIV', position: 'GK', price: 5.0, number: 1 },
  { firstName: 'Yann', lastName: 'Sommer', displayName: 'Sommer', nationCode: 'SUI', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'Hugo', lastName: 'Lloris', displayName: 'Lloris', nationCode: 'FRA', position: 'GK', price: 5.0, number: 1 },
  
  // More Defenders
  { firstName: 'Matthijs', lastName: 'de Ligt', displayName: 'De Ligt', nationCode: 'NED', position: 'DEF', price: 6.0, number: 3 },
  { firstName: 'José', lastName: 'Giménez', displayName: 'Giménez', nationCode: 'URU', position: 'DEF', price: 5.5, number: 2 },
  { firstName: 'Dayot', lastName: 'Upamecano', displayName: 'Upamecano', nationCode: 'FRA', position: 'DEF', price: 5.5, number: 5 },
  { firstName: 'Ibrahima', lastName: 'Konaté', displayName: 'Konaté', nationCode: 'FRA', position: 'DEF', price: 5.0, number: 24 },
  { firstName: 'Pau', lastName: 'Torres', displayName: 'P. Torres', nationCode: 'ESP', position: 'DEF', price: 5.0, number: 4 },
  { firstName: 'Aymeric', lastName: 'Laporte', displayName: 'Laporte', nationCode: 'ESP', position: 'DEF', price: 5.5, number: 24 },
  { firstName: 'Ferland', lastName: 'Mendy', displayName: 'Mendy', nationCode: 'FRA', position: 'DEF', price: 5.5, number: 17 },
  { firstName: 'Lucas', lastName: 'Hernández', displayName: 'L. Hernández', nationCode: 'FRA', position: 'DEF', price: 5.5, number: 21 },
  { firstName: 'Benjamin', lastName: 'Pavard', displayName: 'Pavard', nationCode: 'FRA', position: 'DEF', price: 5.0, number: 2 },
  { firstName: 'Nico', lastName: 'Schlotterbeck', displayName: 'Schlotterbeck', nationCode: 'GER', position: 'DEF', price: 5.0, number: 4 },
  { firstName: 'David', lastName: 'Alaba', displayName: 'Alaba', nationCode: 'AUT', position: 'DEF', price: 6.5, number: 4 },
  { firstName: 'Patrick', lastName: 'Pentz', displayName: 'Pentz', nationCode: 'AUT', position: 'GK', price: 4.5, number: 1 },
  { firstName: 'Maximilian', lastName: 'Wöber', displayName: 'Wöber', nationCode: 'AUT', position: 'DEF', price: 5.0, number: 5 },
  { firstName: 'Kevin', lastName: 'Danso', displayName: 'Danso', nationCode: 'AUT', position: 'DEF', price: 5.0, number: 15 },
  { firstName: 'Konrad', lastName: 'Laimer', displayName: 'Laimer', nationCode: 'AUT', position: 'MID', price: 6.0, number: 8 },
  { firstName: 'Marcel', lastName: 'Sabitzer', displayName: 'Sabitzer', nationCode: 'AUT', position: 'MID', price: 6.5, number: 10 },
  { firstName: 'Christoph', lastName: 'Baumgartner', displayName: 'Baumgartner', nationCode: 'AUT', position: 'MID', price: 6.0, number: 19 },
  { firstName: 'Nicolas', lastName: 'Seiwald', displayName: 'Seiwald', nationCode: 'AUT', position: 'MID', price: 5.5, number: 6 },
  { firstName: 'Marko', lastName: 'Arnautović', displayName: 'Arnautović', nationCode: 'AUT', position: 'FWD', price: 6.5, number: 7 },
  { firstName: 'Michael', lastName: 'Gregoritsch', displayName: 'Gregoritsch', nationCode: 'AUT', position: 'FWD', price: 5.5, number: 11 },
  { firstName: 'Nicolás', lastName: 'Otamendi', displayName: 'Otamendi', nationCode: 'ARG', position: 'DEF', price: 5.0, number: 19 },
  
  // More Midfielders
  { firstName: 'Rodri', lastName: 'Hernández', displayName: 'Rodri', nationCode: 'ESP', position: 'MID', price: 8.5, number: 16 },
  { firstName: 'Ilkay', lastName: 'Gündoğan', displayName: 'Gündoğan', nationCode: 'GER', position: 'MID', price: 7.5, number: 8 },
  { firstName: 'Joshua', lastName: 'Kimmich', displayName: 'Kimmich', nationCode: 'GER', position: 'MID', price: 8.0, number: 6 },
  { firstName: 'Leon', lastName: 'Goretzka', displayName: 'Goretzka', nationCode: 'GER', position: 'MID', price: 7.0, number: 8 },
  { firstName: 'Frenkie', lastName: 'de Jong', displayName: 'De Jong', nationCode: 'NED', position: 'MID', price: 8.0, number: 21 },
  { firstName: 'Xavi', lastName: 'Simons', displayName: 'X. Simons', nationCode: 'NED', position: 'MID', price: 7.5, number: 20 },
  { firstName: 'Casemiro', lastName: '', displayName: 'Casemiro', nationCode: 'BRA', position: 'MID', price: 7.0, number: 5 },
  { firstName: 'Lucas', lastName: 'Paquetá', displayName: 'Paquetá', nationCode: 'BRA', position: 'MID', price: 7.5, number: 11 },
  { firstName: 'Raphinha', lastName: '', displayName: 'Raphinha', nationCode: 'BRA', position: 'MID', price: 7.5, number: 19 },
  { firstName: 'Bernardo', lastName: 'Silva', displayName: 'B. Silva', nationCode: 'POR', position: 'MID', price: 8.5, number: 10 },
  { firstName: 'Diogo', lastName: 'Jota', displayName: 'Jota', nationCode: 'POR', position: 'MID', price: 7.5, number: 21 },
  { firstName: 'Gonçalo', lastName: 'Ramos', displayName: 'G. Ramos', nationCode: 'POR', position: 'MID', price: 7.0, number: 9 },
  { firstName: 'Yunus', lastName: 'Musah', displayName: 'Musah', nationCode: 'USA', position: 'MID', price: 5.5, number: 6 },
  { firstName: 'Gio', lastName: 'Reyna', displayName: 'Reyna', nationCode: 'USA', position: 'MID', price: 6.5, number: 7 },
  { firstName: 'Brenden', lastName: 'Aaronson', displayName: 'Aaronson', nationCode: 'USA', position: 'MID', price: 5.5, number: 11 },
  { firstName: 'Hwang', lastName: 'Hee-chan', displayName: 'Hwang H-C', nationCode: 'KOR', position: 'MID', price: 6.0, number: 9 },
  { firstName: 'Hirving', lastName: 'Lozano', displayName: 'Lozano', nationCode: 'MEX', position: 'MID', price: 6.5, number: 22 },
  { firstName: 'Edson', lastName: 'Álvarez', displayName: 'E. Álvarez', nationCode: 'MEX', position: 'MID', price: 5.5, number: 4 },
  { firstName: 'Luis', lastName: 'Díaz', displayName: 'L. Díaz', nationCode: 'COL', position: 'MID', price: 7.5, number: 7 },
  { firstName: 'James', lastName: 'Rodríguez', displayName: 'J. Rodríguez', nationCode: 'COL', position: 'MID', price: 6.5, number: 10 },
  
  // More Forwards
  { firstName: 'Karim', lastName: 'Benzema', displayName: 'Benzema', nationCode: 'FRA', position: 'FWD', price: 10.0, number: 19 },
  { firstName: 'Olivier', lastName: 'Giroud', displayName: 'Giroud', nationCode: 'FRA', position: 'FWD', price: 7.5, number: 9 },
  { firstName: 'Ousmane', lastName: 'Dembélé', displayName: 'Dembélé', nationCode: 'FRA', position: 'FWD', price: 8.5, number: 11 },
  { firstName: 'Antoine', lastName: 'Griezmann', displayName: 'Griezmann', nationCode: 'FRA', position: 'FWD', price: 8.0, number: 7 },
  { firstName: 'Ángel', lastName: 'Di María', displayName: 'Di María', nationCode: 'ARG', position: 'FWD', price: 8.0, number: 11 },
  { firstName: 'Paulo', lastName: 'Dybala', displayName: 'Dybala', nationCode: 'ARG', position: 'FWD', price: 7.5, number: 21 },
  { firstName: 'Alejandro', lastName: 'Garnacho', displayName: 'Garnacho', nationCode: 'ARG', position: 'FWD', price: 7.0, number: 17 },
  { firstName: 'Gabriel', lastName: 'Jesus', displayName: 'G. Jesus', nationCode: 'BRA', position: 'FWD', price: 8.0, number: 9 },
  { firstName: 'Ivan', lastName: 'Toney', displayName: 'Toney', nationCode: 'ENG', position: 'FWD', price: 7.5, number: 17 },
  { firstName: 'Ollie', lastName: 'Watkins', displayName: 'Watkins', nationCode: 'ENG', position: 'FWD', price: 7.0, number: 11 },
  { firstName: 'Callum', lastName: 'Wilson', displayName: 'Wilson', nationCode: 'ENG', position: 'FWD', price: 6.5, number: 9 },
  { firstName: 'Álvaro', lastName: 'Morata', displayName: 'Morata', nationCode: 'ESP', position: 'FWD', price: 7.0, number: 7 },
  { firstName: 'Ferran', lastName: 'Torres', displayName: 'F. Torres', nationCode: 'ESP', position: 'FWD', price: 7.5, number: 11 },
  { firstName: 'Ansu', lastName: 'Fati', displayName: 'Fati', nationCode: 'ESP', position: 'FWD', price: 7.0, number: 10 },
  { firstName: 'Memphis', lastName: 'Depay', displayName: 'Depay', nationCode: 'NED', position: 'FWD', price: 7.5, number: 10 },
  { firstName: 'Wout', lastName: 'Weghorst', displayName: 'Weghorst', nationCode: 'NED', position: 'FWD', price: 6.5, number: 9 },
  { firstName: 'Timo', lastName: 'Werner', displayName: 'Werner', nationCode: 'GER', position: 'FWD', price: 7.0, number: 11 },
  { firstName: 'Niclas', lastName: 'Füllkrug', displayName: 'Füllkrug', nationCode: 'GER', position: 'FWD', price: 6.5, number: 9 },
  { firstName: 'Randal', lastName: 'Kolo Muani', displayName: 'Kolo Muani', nationCode: 'FRA', position: 'FWD', price: 7.5, number: 12 },

  // ========== NEW QUALIFIERS – PLAYOFF WINNERS ==========

  // CZECHIA (UEFA Path D winner) – Group A
  { firstName: 'Jindřich',  lastName: 'Staněk',     displayName: 'Staněk',     nationCode: 'CZE', position: 'GK',  price: 4.5, number: 1 },
  { firstName: 'Tomáš',     lastName: 'Vlček',      displayName: 'Vlček',      nationCode: 'CZE', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'David',     lastName: 'Zima',       displayName: 'Zima',       nationCode: 'CZE', position: 'DEF', price: 4.5, number: 4 },
  { firstName: 'Vladimír',  lastName: 'Coufal',     displayName: 'Coufal',     nationCode: 'CZE', position: 'DEF', price: 4.5, number: 22 },
  { firstName: 'Tomáš',     lastName: 'Souček',     displayName: 'Souček',     nationCode: 'CZE', position: 'MID', price: 6.5, number: 8 },
  { firstName: 'Pavel',     lastName: 'Šulc',       displayName: 'Šulc',       nationCode: 'CZE', position: 'MID', price: 6.0, number: 11 },
  { firstName: 'Adam',      lastName: 'Hložek',     displayName: 'Hložek',     nationCode: 'CZE', position: 'MID', price: 6.0, number: 15 },
  { firstName: 'Patrik',    lastName: 'Schick',     displayName: 'Schick',     nationCode: 'CZE', position: 'FWD', price: 7.5, number: 9 },
  { firstName: 'Mojmír',    lastName: 'Chytil',     displayName: 'Chytil',     nationCode: 'CZE', position: 'FWD', price: 5.5, number: 19 },

  // BOSNIA & HERZEGOVINA (UEFA Path A winner) – Group B
  { firstName: 'Ibrahim',   lastName: 'Šehić',      displayName: 'Šehić',      nationCode: 'BIH', position: 'GK',  price: 4.5, number: 1 },
  { firstName: 'Sead',      lastName: 'Kolašinac',  displayName: 'Kolašinac',  nationCode: 'BIH', position: 'DEF', price: 5.0, number: 23 },
  { firstName: 'Dennis',    lastName: 'Hadžikadunić', displayName: 'Hadžikadunić', nationCode: 'BIH', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'Adrian',    lastName: 'Leon Barišić', displayName: 'A. Barišić', nationCode: 'BIH', position: 'DEF', price: 4.5, number: 4 },
  { firstName: 'Miralem',   lastName: 'Pjanić',     displayName: 'Pjanić',     nationCode: 'BIH', position: 'MID', price: 6.5, number: 10 },
  { firstName: 'Edin',      lastName: 'Višća',      displayName: 'Višća',      nationCode: 'BIH', position: 'MID', price: 5.5, number: 7 },
  { firstName: 'Benjamin',  lastName: 'Tahirović',  displayName: 'Tahirović',  nationCode: 'BIH', position: 'MID', price: 5.0, number: 8 },
  { firstName: 'Edin',      lastName: 'Džeko',      displayName: 'Džeko',      nationCode: 'BIH', position: 'FWD', price: 7.5, number: 11 },
  { firstName: 'Ermedin',   lastName: 'Demirović',  displayName: 'Demirović',  nationCode: 'BIH', position: 'FWD', price: 6.0, number: 9 },

  // TÜRKIYE (UEFA Path C winner) – Group D
  { firstName: 'Uğurcan',   lastName: 'Çakır',      displayName: 'Çakır',      nationCode: 'TUR', position: 'GK',  price: 4.5, number: 1 },
  { firstName: 'Merih',     lastName: 'Demiral',    displayName: 'Demiral',    nationCode: 'TUR', position: 'DEF', price: 5.0, number: 3 },
  { firstName: 'Çağlar',    lastName: 'Söyüncü',    displayName: 'Söyüncü',    nationCode: 'TUR', position: 'DEF', price: 4.5, number: 4 },
  { firstName: 'Ferdi',     lastName: 'Kadıoğlu',   displayName: 'Kadıoğlu',   nationCode: 'TUR', position: 'DEF', price: 5.0, number: 14 },
  { firstName: 'Hakan',     lastName: 'Çalhanoğlu', displayName: 'Çalhanoğlu', nationCode: 'TUR', position: 'MID', price: 8.0, number: 10 },
  { firstName: 'Arda',      lastName: 'Güler',      displayName: 'A. Güler',   nationCode: 'TUR', position: 'MID', price: 7.5, number: 8 },
  { firstName: 'Orkun',     lastName: 'Kökçü',      displayName: 'Kökçü',      nationCode: 'TUR', position: 'MID', price: 6.0, number: 6 },
  { firstName: 'Kenan',     lastName: 'Yıldız',     displayName: 'Yıldız',     nationCode: 'TUR', position: 'FWD', price: 8.0, number: 21 },
  { firstName: 'Cenk',      lastName: 'Tosun',      displayName: 'Tosun',      nationCode: 'TUR', position: 'FWD', price: 6.0, number: 17 },

  // SWEDEN (UEFA Path B winner) – Group F
  { firstName: 'Robin',     lastName: 'Olsen',      displayName: 'R. Olsen',   nationCode: 'SWE', position: 'GK',  price: 4.5, number: 1 },
  { firstName: 'Victor',    lastName: 'Lindelöf',   displayName: 'Lindelöf',   nationCode: 'SWE', position: 'DEF', price: 5.0, number: 3 },
  { firstName: 'Gabriel',   lastName: 'Gudmundsson',displayName: 'Gudmundsson',nationCode: 'SWE', position: 'DEF', price: 5.0, number: 13 },
  { firstName: 'Isak',      lastName: 'Hien',       displayName: 'Hien',       nationCode: 'SWE', position: 'DEF', price: 5.0, number: 4 },
  { firstName: 'Dejan',     lastName: 'Kulusevski', displayName: 'Kulusevski', nationCode: 'SWE', position: 'MID', price: 7.5, number: 21 },
  { firstName: 'Anthony',   lastName: 'Elanga',     displayName: 'Elanga',     nationCode: 'SWE', position: 'MID', price: 6.5, number: 11 },
  { firstName: 'Lucas',     lastName: 'Bergvall',   displayName: 'Bergvall',   nationCode: 'SWE', position: 'MID', price: 6.0, number: 8 },
  { firstName: 'Alexander', lastName: 'Isak',       displayName: 'Isak',       nationCode: 'SWE', position: 'FWD', price: 11.0, number: 9 },
  { firstName: 'Viktor',    lastName: 'Gyökeres',   displayName: 'Gyökeres',   nationCode: 'SWE', position: 'FWD', price: 11.5, number: 23 },

  // DR CONGO (Inter-Confederation Playoff 1 winner) – Group K
  { firstName: 'Lionel',    lastName: 'Mpasi',      displayName: 'Mpasi',      nationCode: 'COD', position: 'GK',  price: 4.0, number: 1 },
  { firstName: 'Chancel',   lastName: 'Mbemba',     displayName: 'Mbemba',     nationCode: 'COD', position: 'DEF', price: 5.0, number: 4 },
  { firstName: 'Arthur',    lastName: 'Masuaku',    displayName: 'Masuaku',    nationCode: 'COD', position: 'DEF', price: 4.5, number: 3 },
  { firstName: 'Axel',      lastName: 'Tuanzebe',   displayName: 'Tuanzebe',   nationCode: 'COD', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'Charles',   lastName: 'Pickel',     displayName: 'Pickel',     nationCode: 'COD', position: 'MID', price: 5.0, number: 6 },
  { firstName: 'Théo',      lastName: 'Bongonda',   displayName: 'Bongonda',   nationCode: 'COD', position: 'MID', price: 5.5, number: 11 },
  { firstName: 'Yoane',     lastName: 'Wissa',      displayName: 'Wissa',      nationCode: 'COD', position: 'FWD', price: 7.5, number: 18 },
  { firstName: 'Cédric',    lastName: 'Bakambu',    displayName: 'Bakambu',    nationCode: 'COD', position: 'FWD', price: 6.5, number: 9 },
  { firstName: 'Fiston',    lastName: 'Mayele',     displayName: 'Mayele',     nationCode: 'COD', position: 'FWD', price: 6.0, number: 17 },

  // IRAQ (Inter-Confederation Playoff 2 winner) – Group I
  { firstName: 'Jalal',     lastName: 'Hassan',     displayName: 'Jalal Hassan',nationCode: 'IRQ', position: 'GK',  price: 4.0, number: 1 },
  { firstName: 'Ali',       lastName: 'Adnan',      displayName: 'A. Adnan',   nationCode: 'IRQ', position: 'DEF', price: 4.5, number: 3 },
  { firstName: 'Merchas',   lastName: 'Doski',      displayName: 'Doski',      nationCode: 'IRQ', position: 'DEF', price: 4.5, number: 5 },
  { firstName: 'Zaid',      lastName: 'Tahseen',    displayName: 'Z. Tahseen', nationCode: 'IRQ', position: 'DEF', price: 4.5, number: 4 },
  { firstName: 'Amir',      lastName: 'Al-Ammari',  displayName: 'Al-Ammari',  nationCode: 'IRQ', position: 'MID', price: 5.0, number: 8 },
  { firstName: 'Ibrahim',   lastName: 'Bayesh',     displayName: 'Bayesh',     nationCode: 'IRQ', position: 'MID', price: 5.0, number: 10 },
  { firstName: 'Bashar',    lastName: 'Resan',      displayName: 'B. Resan',   nationCode: 'IRQ', position: 'MID', price: 4.5, number: 6 },
  { firstName: 'Aymen',     lastName: 'Hussein',    displayName: 'A. Hussein', nationCode: 'IRQ', position: 'FWD', price: 5.5, number: 9 },
  { firstName: 'Mohanad',   lastName: 'Ali',        displayName: 'Mohanad Ali',nationCode: 'IRQ', position: 'FWD', price: 5.5, number: 11 },
];

async function main() {
  console.log('🏆 World Cup 2026 Fantasy - Database Seed');
  console.log('=========================================\n');

  // Clear existing data (but preserve admin users)
  console.log('🗑️  Clearing existing data (preserving admin users)...');
  await prisma.auditLog.deleteMany();
  await prisma.leagueMembership.deleteMany();
  await prisma.league.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.teamStage.deleteMany();
  await prisma.squadPlayer.deleteMany();
  await prisma.team.deleteMany();
  await prisma.session.deleteMany();
  // Only delete non-admin users
  await prisma.user.deleteMany({
    where: { isAdmin: false },
  });
  await prisma.playerPerformance.deleteMany();
  await prisma.player.deleteMany();
  await prisma.match.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.nation.deleteMany();

  // Create or update admin user
  console.log('👤 Ensuring admin user exists...');
  const adminEmail = 'admin@worldcupfantasy.com';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  
  let adminUser;
  if (existingAdmin) {
    // Update existing admin to ensure isAdmin is true
    adminUser = await prisma.user.update({
      where: { email: adminEmail },
      data: { isAdmin: true },
    });
    console.log('   ✓ Admin user already exists: admin@worldcupfantasy.com\n');
  } else {
    // Create new admin user
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        username: 'admin',
        passwordHash: await hashPassword('admin123'),
        isAdmin: true,
      },
    });
    console.log('   ✓ Admin created: admin@worldcupfantasy.com / admin123\n');
  }

  // Create nations
  console.log('🌍 Creating nations...');
  const nationMap: Record<string, string> = {};
  for (const nation of nations) {
    const created = await prisma.nation.create({
      data: {
        name: nation.name,
        code: nation.code,
        group: nation.group,
        kitColor1: nation.kitColor1,
        kitColor2: nation.kitColor2,
      },
    });
    nationMap[nation.code] = created.id;
  }
  console.log(`   ✓ Created ${nations.length} nations\n`);

  // Create stages
  console.log('📅 Creating tournament stages...');
  const startDate = new Date('2026-06-11T18:00:00Z');
  
  for (const stage of stages) {
    const deadline = new Date(startDate);
    deadline.setDate(deadline.getDate() + (stage.order - 1) * 3);
    
    await prisma.stage.create({
      data: {
        stageId: stage.stageId,
        name: stage.name,
        order: stage.order,
        deadlineTime: deadline,
        isActive: stage.order === 1,
      },
    });
  }
  console.log(`   ✓ Created ${stages.length} stages\n`);

  // Create players (using correct field names from schema)
  console.log('⚽ Creating players...');
  let playerCount = 0;
  for (const player of players) {
    const nationId = nationMap[player.nationCode];
    if (nationId) {
      await prisma.player.create({
        data: {
          firstName: player.firstName,
          lastName: player.lastName,
          displayName: player.displayName,
          nationId,
          position: player.position,
          currentPrice: player.price,
          shirtNumber: player.number,
        },
      });
      playerCount++;
    }
  }
  console.log(`   ✓ Created ${playerCount} players\n`);

  // Create global league
  console.log('🏆 Creating global league...');
  await prisma.league.create({
    data: {
      name: 'World Cup 2026 - Global League',
      code: 'WC2026GL',
      ownerId: adminUser.id,
      isGlobal: true,
    },
  });
  console.log('   ✓ Global league created\n');

  // Summary
  const nationCount = await prisma.nation.count();
  const stageCount = await prisma.stage.count();
  const finalPlayerCount = await prisma.player.count();
  
  // Count by position
  const gkCount = await prisma.player.count({ where: { position: 'GK' } });
  const defCount = await prisma.player.count({ where: { position: 'DEF' } });
  const midCount = await prisma.player.count({ where: { position: 'MID' } });
  const fwdCount = await prisma.player.count({ where: { position: 'FWD' } });
  
  console.log('=========================================');
  console.log('✅ Seed completed successfully!\n');
  console.log('📊 Database Stats:');
  console.log(`   • Nations: ${nationCount}`);
  console.log(`   • Stages: ${stageCount}`);
  console.log(`   • Players: ${finalPlayerCount}`);
  console.log(`     - GK: ${gkCount}`);
  console.log(`     - DEF: ${defCount}`);
  console.log(`     - MID: ${midCount}`);
  console.log(`     - FWD: ${fwdCount}`);
  console.log('\n👤 Login Credentials:');
  console.log('   Email: admin@worldcupfantasy.com');
  console.log('   Password: admin123');
  console.log('=========================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
