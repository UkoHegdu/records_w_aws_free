import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Bell, Trophy, User, ArrowRight, Zap } from 'lucide-react';

const Landing: React.FC = () => {
    const features = [
        {
            icon: Bell,
            title: "Mapper Alerts",
            description: "Set and manage alerts for when someone drives one of your maps. Never miss a reaction again!",
            color: "from-primary to-primary-glow"
        },
        {
            icon: Trophy,
            title: "Newest Records",
            description: "See the newest records on your maps without setting any alerts. Stay updated effortlessly.",
            color: "from-secondary-bright to-secondary-bright-glow"
        },
        {
            icon: User,
            title: "Driver Notifications",
            description: "Get notified when someone beats your world record. Track your competitive standing.",
            color: "from-primary to-secondary"
        }
    ];

    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
                {/* Background Gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary-bright/10" />
                <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-background/90" />

                {/* Speed Lines Animation */}
                <div className="absolute inset-0 speed-lines opacity-20" />

                {/* Hero Content */}
                <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
                    <div className="racing-glow">
                        <div className="flex items-center justify-center mb-6">
                            <div className="p-4 bg-gradient-to-br from-primary via-primary-glow to-secondary-bright rounded-2xl shadow-glow">
                                <MapPin className="w-12 h-12 text-white" />
                            </div>
                        </div>

                        <h1 className="text-6xl md:text-7xl font-bold mb-6">
                            <span className="bg-gradient-to-r from-primary via-primary-glow to-secondary-bright bg-clip-text text-transparent">
                                TrackMania
                            </span>
                            <br />
                            <span className="text-foreground">Record Tracker</span>
                        </h1>

                        <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
                            Track who has driven your maps and who has bested your times.
                            Never miss a streamer's reaction or a new world record again.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <Link
                                to="/login"
                                className="btn-racing inline-flex items-center gap-2 text-lg"
                            >
                                Get Started
                                <ArrowRight size={20} />
                            </Link>
                            <Link
                                to="/register"
                                className="btn-racing-secondary inline-flex items-center gap-2 text-lg"
                            >
                                <Zap size={20} />
                                Create Account
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-20 px-6 bg-gradient-to-b from-background to-card/50">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold mb-6">
                            <span className="bg-gradient-to-r from-primary to-secondary-bright bg-clip-text text-transparent">
                                Powerful Features
                            </span>
                        </h2>
                        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                            Everything you need to stay connected with your TrackMania community
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {features.map((feature, index) => (
                            <div key={index} className="racing-card group">
                                <div className="text-center">
                                    <div className={`p-4 rounded-2xl bg-gradient-to-br ${feature.color} w-16 h-16 mx-auto mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                        <feature.icon className="w-8 h-8 text-white" />
                                    </div>

                                    <h3 className="text-2xl font-bold mb-4 text-foreground">
                                        {feature.title}
                                    </h3>

                                    <p className="text-muted-foreground leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="text-center mt-16">
                        <div className="racing-card max-w-2xl mx-auto">
                            <h3 className="text-2xl font-bold mb-4">Ready to Start Tracking?</h3>
                            <p className="text-muted-foreground mb-6">
                                The functionality becomes available once you log in. Join the community and never miss an important moment in TrackMania!
                            </p>
                            <Link
                                to="/login"
                                className="btn-racing inline-flex items-center gap-2"
                            >
                                Log In Now
                                <ArrowRight size={20} />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Landing;