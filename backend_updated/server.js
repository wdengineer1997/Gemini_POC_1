const app = express();
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: {
    origin: "*",  // Allow all origins
    methods: ["GET", "POST"]
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Update Express CORS as well
app.use(cors({
  origin: "*"  // Allow all origins
}));
app.use(express.json({ limit: '50mb' })); 