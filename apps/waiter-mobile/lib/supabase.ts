import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL;const key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const configError=!url||!key?'Configuration Supabase manquante dans apps/waiter-mobile/.env':null;
export const supabase=createClient(url||'https://configuration-manquante.invalid',key||'missing',{auth:{storage:AsyncStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
