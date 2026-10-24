import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import type { Session } from "@supabase/supabase-js";
import {
  formatMoney,
  NEXT_ACTION,
  NEXT_STATUS,
  ORDER_LABELS,
  type OrderStatus,
} from "@cafe/domain";
import { configError, supabase } from "./lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
type Order = {
  id: string;
  public_ref: string;
  status: OrderStatus;
  total_minor: number;
  currency: string;
  version: number;
  created_at: string;
  order_note: string | null;
  fulfillment_type: 'dine_in' | 'delivery';
  customer_phone: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  cafe_tables: { label: string } | null;
  order_items: any[];
  order_status_history: any[];
};
const activeStatuses = ["nouvelle", "acceptee", "en_preparation", "prete"];

export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [passwordFlow, setPasswordFlow] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const handleUrl = async (url: string | null | undefined) => {
      if (!url) return;
      const rawParams = url.includes("#")
        ? url.split("#")[1]
        : url.split("?")[1];
      const params = new URLSearchParams(rawParams || "");
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const code = params.get("code");
      const type = params.get("type");
      if (accessToken && refreshToken)
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      else if (code) await supabase.auth.exchangeCodeForSession(code);
      if (type === "invite" || type === "recovery") setPasswordFlow(true);
    };
    Linking.getInitialURL().then(handleUrl);
    const listener = Linking.addEventListener("url", ({ url }) =>
      handleUrl(url),
    );
    return () => listener.remove();
  }, []);
  if (configError)
    return <Message title="Configuration requise" body={configError} />;
  if (loading) return <Message title="Café Serveur" body="Chargement…" />;
  if (session && passwordFlow)
    return <PasswordSetup done={() => setPasswordFlow(false)} />;
  return (
    <>
      <StatusBar style="dark" />
      {session ? <Waiter session={session} /> : <Login />}
    </>
  );
}

function PasswordSetup({ done }: { done: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (password.length < 12)
      return setError("Utilisez au moins 12 caractères.");
    if (password !== confirmation)
      return setError("Les deux mots de passe ne correspondent pas.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error)
      return setError("Le lien a expiré ou le mot de passe est refusé.");
    done();
  }
  return (
    <SafeAreaView style={s.login}>
      <View style={s.loginCard}>
        <Text style={s.h1}>Choisir votre mot de passe</Text>
        <Text style={s.muted}>
          Finalisez l’invitation ou la réinitialisation de votre compte serveur.
        </Text>
        <Text style={s.label}>Nouveau mot de passe</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />
        <Text style={s.label}>Confirmation</Text>
        <TextInput
          style={s.input}
          value={confirmation}
          onChangeText={setConfirmation}
          secureTextEntry
          autoComplete="new-password"
        />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Button
          title={busy ? "Enregistrement…" : "Enregistrer"}
          onPress={save}
          disabled={busy}
        />
      </View>
    </SafeAreaView>
  );
}

function Login() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login() {
    setBusy(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error)
      return (setError("Email ou mot de passe incorrect."), setBusy(false));
    const { data: p } = await supabase
      .from("staff_profiles")
      .select("role,active")
      .eq("user_id", data.user.id)
      .single();
    if (p?.role !== "waiter" || !p.active) {
      await supabase.auth.signOut();
      setError("Ce compte serveur est désactivé ou invalide.");
    }
    setBusy(false);
  }
  return (
    <SafeAreaView style={s.login}>
      <View style={s.loginCard}>
        <View style={s.logo}>
          <Text style={s.logoIcon}>☕</Text>
          <Text style={s.brand}>Café Serveur</Text>
        </View>
        <Text style={s.h1}>Connexion</Text>
        <Text style={s.muted}>
          Retrouvez les commandes de votre café en temps réel.
        </Text>
        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Text style={s.label}>Mot de passe</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Button
          title={busy ? "Connexion…" : "Se connecter"}
          onPress={login}
          disabled={busy}
        />
        <Pressable
          onPress={async () =>
            email
              ? supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: "cafe-waiter://auth",
                })
              : setError("Saisissez votre email.")
          }
        >
          <Text style={s.link}>Mot de passe oublié ?</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Waiter({ session }: { session: Session }) {
  const [profile, setProfile] = useState<any>(null),
    [orders, setOrders] = useState<Order[]>([]),
    [tab, setTab] = useState<"active" | "history" | "account">("active"),
    [selected, setSelected] = useState<Order | null>(null),
    [loading, setLoading] = useState(true),
    [offline, setOffline] = useState(false),
    [notice, setNotice] = useState(""),
    [permission, setPermission] = useState<string>("indéterminée");
  async function fetchProfile() {
    const { data } = await supabase
      .from("staff_profiles")
      .select("*,cafes(name,status)")
      .eq("user_id", session.user.id)
      .single();
    if (!data?.active || (data?.cafes?.status === "suspended" && false)) {
      await supabase.auth.signOut();
      return;
    }
    setProfile(data);
  }
  async function load() {
    setLoading(true);
    const terminal = tab === "history";
    let q = supabase
      .from("orders")
      .select("*,cafe_tables(label),order_items(*),order_status_history(*)")
      .order("created_at", { ascending: false })
      .limit(terminal ? 50 : 100);
    q = terminal
      ? q.in("status", ["servie", "annulee"])
      : q.in("status", activeStatuses);
    const { data, error } = await q;
    if (error) {
      setOffline(true);
      setNotice("Impossible de synchroniser. Vérifiez votre connexion.");
    } else {
      setOrders((data || []) as Order[]);
      setOffline(false);
    }
    setLoading(false);
  }
  useEffect(() => {
    fetchProfile();
  }, []);
  useEffect(() => {
    load();
  }, [tab]);
  useEffect(() => {
    if (!profile?.cafe_id) return;
    const channel = supabase
      .channel(`orders:${profile.cafe_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `cafe_id=eq.${profile.cafe_id}`,
        },
        () => load(),
      )
      .subscribe((status) =>
        setOffline(status === "CHANNEL_ERROR" || status === "TIMED_OUT"),
      );
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => {
      supabase.removeChannel(channel);
      sub.remove();
    };
  }, [profile?.cafe_id, tab]);
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const orderId = response.notification.request.content.data?.orderId;
        if (
          typeof orderId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(orderId)
        )
          return;
        const { data } = await supabase
          .from("orders")
          .select("*,cafe_tables(label),order_items(*),order_status_history(*)")
          .eq("id", orderId)
          .single();
        if (data) setSelected(data as Order);
      },
    );
    return () => subscription.remove();
  }, []);
  async function notifications() {
    const projectId =
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
      Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId) || projectId === '00000000-0000-0000-0000-000000000000') {
      setNotice('Notifications non configurées : renseignez EXPO_PUBLIC_EAS_PROJECT_ID et utilisez un build mobile configuré.');
      return;
    }
    try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted")
      status = (await Notifications.requestPermissionsAsync()).status;
    setPermission(status);
    if (status !== "granted" || !Device.isDevice) return;
    if (Platform.OS === "android")
      await Notifications.setNotificationChannelAsync("orders", {
        name: "Nouvelles commandes",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
      });
    const token = (await Notifications.getExpoPushTokenAsync({ projectId }))
      .data;
    const { error } = await supabase.functions.invoke("register-device", {
      body: { token, platform: Platform.OS },
    });
    setNotice(
      error
        ? "Le jeton push n’a pas pu être enregistré."
        : "Notifications activées sur cet appareil.",
    );
    } catch {
      setNotice('Activation des notifications impossible. Vérifiez le build mobile, les credentials push et la connexion.');
    }
  }
  async function transition(order: Order, to: OrderStatus, reason?: string) {
    if (offline) return;
    const { data, error } = await supabase.rpc("transition_order", {
      p_order_id: order.id,
      p_expected_version: order.version,
      p_to_status: to,
      p_reason: reason || null,
    });
    if (error || data?.error) {
      setNotice(
        data?.error === "CONFLICT"
          ? "Cette commande a déjà été modifiée. État actualisé."
          : "Transition refusée.",
      );
      await load();
      return;
    }
    setNotice(
      `Commande ${order.public_ref} : ${ORDER_LABELS[to].toLowerCase()}.`,
    );
    setSelected(null);
    await load();
  }
  if (!profile)
    return (
      <Message
        title="Synchronisation"
        body="Vérification du compte et du café…"
      />
    );
  return (
    <SafeAreaView style={s.app}>
      <View style={s.topbar}>
        <View>
          <Text style={s.brand}>☕ {profile.cafes?.name}</Text>
          <Text style={s.online}>
            {offline ? "● Reconnexion…" : "● En ligne"}
          </Text>
        </View>
      </View>
      {offline ? (
        <View style={s.offline}>
          <Text>
            Connexion perdue — consultation possible, actions désactivées.
          </Text>
        </View>
      ) : null}
      {notice ? (
        <Pressable style={s.notice} onPress={() => setNotice("")}>
          <Text>{notice}</Text>
        </Pressable>
      ) : null}
      <View style={s.content}>
        {tab === "account" ? (
          <Account
            profile={profile}
            permission={permission}
            onNotifications={notifications}
          />
        ) : (
          <>
            <View style={s.titleRow}>
              <View>
                <Text style={s.h1}>
                  {tab === "active" ? "Commandes actives" : "Historique"}
                </Text>
                <Text style={s.muted}>
                  {orders.length} commande{orders.length !== 1 ? "s" : ""}
                </Text>
              </View>
              <Pressable style={s.filter} onPress={load}>
                <Text>↻</Text>
              </Pressable>
            </View>
            {loading ? (
              <ActivityIndicator color="#8B5E3C" size="large" />
            ) : (
              <FlatList
                data={orders}
                keyExtractor={(o) => o.id}
                contentContainerStyle={{ gap: 12, paddingBottom: 100 }}
                ListEmptyComponent={
                  <View style={s.empty}>
                    <Text style={s.emptyIcon}>✓</Text>
                    <Text style={s.h2}>
                      Aucune commande {tab === "active" ? "active" : ""}
                    </Text>
                    <Text style={s.muted}>Tout est à jour.</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <OrderCard
                    order={item}
                    offline={offline}
                    onOpen={() => setSelected(item)}
                    onTransition={transition}
                  />
                )}
              />
            )}
          </>
        )}
      </View>
      <View style={s.nav}>
        {[
          ["active", "▦", "Actives"],
          ["history", "◷", "Historique"],
          ["account", "♙", "Compte"],
        ].map(([key, icon, label]) => (
          <Pressable
            key={key}
            style={s.navItem}
            onPress={() => setTab(key as any)}
          >
            <Text style={[s.navIcon, tab === key && s.navActive]}>{icon}</Text>
            <Text style={[s.navLabel, tab === key && s.navActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <OrderModal
        order={selected}
        offline={offline}
        close={() => setSelected(null)}
        transition={transition}
      />
    </SafeAreaView>
  );
}

function OrderCard({
  order,
  offline,
  onOpen,
  onTransition,
}: {
  order: Order;
  offline: boolean;
  onOpen: () => void;
  onTransition: (o: Order, s: OrderStatus) => void;
}) {
  const next = NEXT_STATUS[order.status];
  return (
    <Pressable
      style={[s.orderCard, { borderLeftColor: statusColor(order.status) }]}
      onPress={onOpen}
    >
      <View style={s.orderHead}>
        <View>
          <Text style={s.table}>{order.fulfillment_type === 'delivery' ? 'Livraison' : order.cafe_tables?.label}</Text>
          <Text style={s.ref}>{order.public_ref}</Text>
        </View>
        <View style={[s.status, { backgroundColor: statusBg(order.status) }]}>
          <Text style={{ color: statusColor(order.status), fontWeight: "700" }}>
            {order.fulfillment_type === 'delivery' && order.status === 'servie' ? 'Livrée' : ORDER_LABELS[order.status]}
          </Text>
        </View>
      </View>
      {order.order_items.slice(0, 3).map((i) => (
        <Text key={i.id} style={s.item}>
          {i.quantity}× {i.product_name_snapshot}
        </Text>
      ))}
      {order.order_note ? (
        <Text style={s.note}>▤ {order.order_note}</Text>
      ) : null}
      <View style={s.total}>
        <Text>Total</Text>
        <Text style={s.totalValue}>
          {formatMoney(order.total_minor, order.currency)}
        </Text>
      </View>
      {next ? (
        <Button
          title={order.fulfillment_type === 'delivery' && order.status === 'prete' ? 'Marquer livrée' : NEXT_ACTION[order.status] || "Continuer"}
          onPress={() => onTransition(order, next)}
          disabled={offline}
        />
      ) : null}
    </Pressable>
  );
}

function OrderModal({
  order,
  offline,
  close,
  transition,
}: {
  order: Order | null;
  offline: boolean;
  close: () => void;
  transition: (order: Order, status: OrderStatus, reason?: string) => void;
}) {
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  if (!order) return null;
  const next = NEXT_STATUS[order.status];
  const actions = cancel ? (
    <View style={{ gap: 12 }}>
      <Text style={s.label}>Motif obligatoire</Text>
      <TextInput
        style={s.input}
        value={reason}
        onChangeText={setReason}
        multiline
        placeholder="Ex. client parti"
      />
      <Button
        title="Confirmer l’annulation"
        danger
        onPress={() => transition(order, "annulee", reason)}
        disabled={!reason.trim() || offline}
      />
      <Button title="Retour" secondary onPress={() => setCancel(false)} />
    </View>
  ) : (
    <View style={{ gap: 12 }}>
      {next ? (
        <Button
          title={order.fulfillment_type === 'delivery' && order.status === 'prete' ? 'Marquer livrée' : NEXT_ACTION[order.status] || "Continuer"}
          onPress={() => transition(order, next)}
          disabled={offline}
        />
      ) : null}
      {!["servie", "annulee"].includes(order.status) ? (
        <Button
          title="Annuler la commande"
          danger
          onPress={() => setCancel(true)}
          disabled={offline}
        />
      ) : null}
    </View>
  );
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={s.modal}>
        <ScrollView contentContainerStyle={{ padding: 22, gap: 16 }}>
          <Pressable onPress={close}>
            <Text style={s.link}>← Fermer</Text>
          </Pressable>
          <Text style={s.h1}>{order.fulfillment_type === 'delivery' ? 'Livraison' : order.cafe_tables?.label}</Text>
          {order.fulfillment_type === 'delivery' && <View style={[s.detailBox, { gap: 12 }]}>
            <Text style={s.h2}>Coordonnées du client</Text>
            <Text selectable>{order.customer_phone || 'Téléphone indisponible'}</Text>
            {order.customer_phone && <Button title="Appeler le client" secondary onPress={() => { void Linking.openURL(`tel:${order.customer_phone}`).catch(() => Alert.alert('Appel impossible', 'Composez le numéro affiché depuis votre téléphone.')); }} />}
            {order.delivery_latitude != null && order.delivery_longitude != null && <>
              <Text selectable>Position : {order.delivery_latitude.toFixed(6)}, {order.delivery_longitude.toFixed(6)}</Text>
              <Button title="Ouvrir le lieu de livraison" secondary onPress={() => { void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${order.delivery_latitude},${order.delivery_longitude}`).catch(() => Alert.alert('Carte indisponible', 'Vérifiez votre connexion.')); }} />
            </>}
            <Text style={s.muted}>Coordonnées partagées uniquement pour effectuer cette livraison.</Text>
          </View>}
          <Text style={s.ref}>
            {order.public_ref} ·{" "}
            {new Date(order.created_at).toLocaleTimeString("fr-MA", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          <View style={s.detailBox}>
            {order.order_items.map((i) => (
              <View key={i.id} style={s.detailLine}>
                <View>
                  <Text style={s.item}>
                    {i.quantity}× {i.product_name_snapshot}
                  </Text>
                  {i.note ? <Text style={s.note}>{i.note}</Text> : null}
                </View>
                <Text>{formatMoney(i.line_total_minor, order.currency)}</Text>
              </View>
            ))}
          </View>
          <View style={s.total}>
            <Text style={s.h2}>Total</Text>
            <Text style={s.h2}>
              {formatMoney(order.total_minor, order.currency)}
            </Text>
          </View>
          {order.order_note ? (
            <Text style={s.note}>Note générale : {order.order_note}</Text>
          ) : null}
          <View style={s.detailBox}>
            <Text style={s.h2}>Chronologie</Text>
            {[...(order.order_status_history || [])]
              .sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime(),
              )
              .map((event) => (
                <View key={event.id} style={s.detailLine}>
                  <Text>{order.fulfillment_type === 'delivery' && event.to_status === 'servie' ? 'Livrée' : ORDER_LABELS[event.to_status as OrderStatus]}</Text>
                  <Text style={s.muted}>
                    {new Date(event.created_at).toLocaleTimeString("fr-MA", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              ))}
          </View>
          {actions}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Account({
  profile,
  permission,
  onNotifications,
}: {
  profile: any;
  permission: string;
  onNotifications: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 100 }}>
      <Text style={s.h1}>Compte</Text>
      <View style={s.accountCard}>
        <Text style={s.h2}>{profile.display_name}</Text>
        <Text style={s.muted}>{profile.cafes?.name}</Text>
      </View>
      <View style={s.accountCard}>
        <Text style={s.h2}>Notifications</Text>
        <Text style={s.muted}>
          État : {permission}. Les notifications restent génériques sur l’écran
          verrouillé.
        </Text>
        <Button title="Activer les notifications" onPress={onNotifications} />
        <Pressable onPress={() => Linking.openSettings()}>
          <Text style={s.link}>Ouvrir les réglages système</Text>
        </Pressable>
      </View>
      <Button
        title="Se déconnecter"
        secondary
        onPress={() => supabase.auth.signOut()}
      />
    </ScrollView>
  );
}
function Button({
  title,
  onPress,
  disabled,
  secondary,
  danger,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.buttonSecondary,
        danger && s.buttonDanger,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text
        style={[
          s.buttonText,
          (secondary || danger) && { color: danger ? "#B84444" : "#2B2118" },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
function Message({ title, body }: { title: string; body: string }) {
  return (
    <SafeAreaView style={s.message}>
      <Text style={s.logoIcon}>☕</Text>
      <Text style={s.h1}>{title}</Text>
      <Text style={s.muted}>{body}</Text>
    </SafeAreaView>
  );
}
const statusColor = (v: OrderStatus) =>
  v === "nouvelle"
    ? "#B84444"
    : v === "prete" || v === "servie"
      ? "#247A4A"
      : v === "annulee"
        ? "#6D6259"
        : "#A96509";
const statusBg = (v: OrderStatus) =>
  v === "nouvelle"
    ? "#FCE8E6"
    : v === "prete" || v === "servie"
      ? "#E7F6EC"
      : v === "annulee"
        ? "#EEEAE5"
        : "#FFF2DC";
const s = StyleSheet.create({
  app: { flex: 1, backgroundColor: "#FFFDF8" },
  message: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 10,
    backgroundColor: "#FFFDF8",
  },
  login: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "#F7F4EF",
  },
  loginCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 24,
    gap: 10,
    borderWidth: 1,
    borderColor: "#D9CEC1",
  },
  logo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  logoIcon: { fontSize: 38 },
  brand: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 22,
    fontWeight: "700",
    color: "#4A2D1C",
  },
  h1: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 28,
    fontWeight: "700",
    color: "#2B2118",
  },
  h2: { fontSize: 18, fontWeight: "700", color: "#2B2118" },
  muted: { color: "#6D6259", lineHeight: 21 },
  label: { fontSize: 14, fontWeight: "600", marginTop: 6, color: "#2B2118" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D9CEC1",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  error: {
    color: "#B84444",
    backgroundColor: "#FFF0EF",
    padding: 10,
    borderRadius: 8,
  },
  link: {
    color: "#8B5E3C",
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 10,
  },
  button: {
    minHeight: 50,
    backgroundColor: "#8B5E3C",
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  buttonSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D9CEC1",
  },
  buttonDanger: {
    backgroundColor: "#FFF0EF",
    borderWidth: 1,
    borderColor: "#E9B8B3",
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  topbar: {
    padding: 18,
    borderBottomWidth: 1,
    borderColor: "#E7DDD3",
    backgroundColor: "#FFFDF8",
  },
  online: { color: "#247A4A", fontSize: 12, marginTop: 3 },
  offline: { backgroundColor: "#FFF2DC", padding: 10, alignItems: "center" },
  notice: { backgroundColor: "#E9F2F7", padding: 11, alignItems: "center" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  filter: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: "#D9CEC1",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", padding: 60, gap: 8 },
  emptyIcon: { fontSize: 40, color: "#247A4A" },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2D8CE",
    borderLeftWidth: 4,
    padding: 14,
    gap: 10,
  },
  orderHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  table: { fontSize: 19, fontWeight: "700" },
  ref: { fontSize: 13, color: "#6D6259", marginTop: 3 },
  status: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  item: { fontSize: 15, color: "#2B2118" },
  note: {
    backgroundColor: "#F7F4EF",
    padding: 9,
    borderRadius: 7,
    color: "#6D6259",
  },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#E7DDD3",
    paddingTop: 12,
  },
  totalValue: { fontSize: 19, fontWeight: "700" },
  nav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 78,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#D9CEC1",
    flexDirection: "row",
    paddingBottom: 8,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  navIcon: { fontSize: 22, color: "#6D6259" },
  navLabel: { fontSize: 12, color: "#6D6259", marginTop: 4 },
  navActive: { color: "#8B5E3C", fontWeight: "700" },
  modal: { flex: 1, backgroundColor: "#FFFDF8" },
  detailBox: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D9CEC1",
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  detailLine: { flexDirection: "row", justifyContent: "space-between" },
  accountCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D9CEC1",
    borderRadius: 14,
    padding: 18,
    gap: 12,
  },
});
